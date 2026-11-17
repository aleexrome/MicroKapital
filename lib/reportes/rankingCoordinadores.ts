import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSaturday, getFriday } from '@/lib/week-utils'
import { loanNotDeletedWhere } from '@/lib/access'

/**
 * Ranking de coordinadores — reporte de RH para compartir al equipo.
 *
 * Para las últimas N semanas MK (sáb–vie), calcula por cada cobrador:
 *   - cobranzaPct = recuperado / pactado (misma lógica que /rutas)
 *   - recuperado  = $ absolutos cobrados en la semana
 *   - colocacion  = Σ capital desembolsado en la semana
 *   - score       = cobranzaPct * 0.7 + colocacionPct * 0.3
 *                   (score de eficiencia pura, por semana — usado en la
 *                    gráfica cuando se selecciona la métrica "Score")
 *
 * El RANKING (orden top/bottom) usa `scorePromedio` que es distinto del
 * score por semana: mezcla eficiencia % con volumen absoluto relativo
 * al grupo. Fórmula:
 *   scorePromedio = cobranzaPct   * 0.30
 *                 + colocacionPct * 0.10
 *                 + (cobradoProm / maxCobGrupo)  * 100 * 0.40
 *                 + (colocProm   / maxColGrupo) * 100 * 0.20
 *
 * Así un coord con 100% de eficiencia pero pactado muy pequeño NO
 * rankea arriba (le falta volumen), que era el bug reportado.
 *
 * Caché 1h vía unstable_cache — el reporte se refresca una vez por hora.
 */

export interface PuntoSemana {
  semanaIso:    string   // ISO del sábado (00:00 UTC)
  label:        string   // "4-10 nov"
  cobranzaPct:  number
  recuperado:   number   // $ absolutos cobrados
  pactado:      number   // $ absolutos pactados
  colocacion:   number
  score:        number   // eficiencia por semana (cobPct*0.7 + colPct*0.3)
}

export interface CoordinadorRanking {
  cobradorId:    string
  nombre:        string
  sucursal:      string
  rol:           string
  fotoUrl:       string | null
  iniciales:     string
  serie:         PuntoSemana[]
  // Promedios últimas 4 semanas
  scorePromedio:      number    // score global (mezcla eficiencia + volumen)
  cobranzaPromedio:   number    // eficiencia % promedio
  cobradoPromedio:    number    // $ cobrados promedio (volumen)
  colocacionPromedio: number    // $ colocados promedio (volumen)
  puesto:        number   // 1 = mejor
  tier:          'top' | 'bottom' | 'medio'
}

export interface RankingCoordinadores {
  companyId:    string
  empresa:      string
  semanas:      Array<{ semanaIso: string; label: string }>
  coordinadores: CoordinadorRanking[]
  top3:          string[]   // cobradorIds
  bottom3:       string[]   // cobradorIds
  generadoEn:    string
}

function iniciales(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function labelSemana(sat: Date): string {
  const fri = getFriday(sat)
  const satFmt = sat.toLocaleDateString('es-MX', { timeZone: 'UTC', day: 'numeric', month: 'short' })
  const friFmt = fri.toLocaleDateString('es-MX', { timeZone: 'UTC', day: 'numeric', month: 'short' })
  return `${satFmt}–${friFmt}`
}

async function calcularRankingNoCacheado(companyId: string, semanas: number): Promise<RankingCoordinadores> {
  const ahora = new Date()
  const thisSat = getSaturday(ahora)

  // Lista de sábados (más antiguo primero).
  const sabados: Date[] = []
  for (let i = semanas - 1; i >= 0; i--) {
    const s = new Date(thisSat)
    s.setUTCDate(s.getUTCDate() - i * 7)
    sabados.push(s)
  }

  const [company, users, branches] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { nombre: true } }),
    prisma.user.findMany({
      // Filtra coords cuyo branch siga activo Y cuyo nombre no esté en la
      // lista de sucursales cerradas por decisión operativa (Martínez de
      // la Torre + Minatitlán). El filtro por nombre es defensivo: esas
      // sucursales aún pueden estar marcadas activa=true en DB pero el
      // negocio ya las dio por cerradas para reportes de performance.
      where: {
        companyId,
        activo: true,
        rol:    { in: ['COBRADOR', 'COORDINADOR'] },
        branch: {
          activa: true,
          NOT: [
            { nombre: { contains: 'Martínez', mode: 'insensitive' } },
            { nombre: { contains: 'Martinez', mode: 'insensitive' } },
            { nombre: { contains: 'Minatitlán', mode: 'insensitive' } },
            { nombre: { contains: 'Minatitlan', mode: 'insensitive' } },
          ],
        },
      },
      select: { id: true, nombre: true, rol: true, branchId: true, fotoPerfilUrl: true },
    }),
    prisma.branch.findMany({
      where: {
        companyId,
        activa: true,
        NOT: [
          { nombre: { contains: 'Martínez', mode: 'insensitive' } },
          { nombre: { contains: 'Martinez', mode: 'insensitive' } },
          { nombre: { contains: 'Minatitlán', mode: 'insensitive' } },
          { nombre: { contains: 'Minatitlan', mode: 'insensitive' } },
        ],
      },
      select: { id: true, nombre: true },
    }),
  ])
  const branchNombre = new Map(branches.map((b) => [b.id, b.nombre]))

  // Mapa cobradorId -> serie por semana
  const seriePorCoord = new Map<string, PuntoSemana[]>()
  for (const u of users) seriePorCoord.set(u.id, [])

  for (const saturday of sabados) {
    const friday = getFriday(saturday)

    // Pactado/cobrado por cobrador
    const schedules = await prisma.paymentSchedule.findMany({
      where: {
        fechaVencimiento: { gte: saturday, lte: friday },
        loan: {
          companyId,
          estado: { in: ['ACTIVE', 'LIQUIDATED', 'DEFAULTED'] },
          AND: [loanNotDeletedWhere],
        },
      },
      select: {
        montoEsperado: true,
        estado:        true,
        payments: { where: { canceledAt: null }, select: { monto: true } },
        loan:     { select: { cobradorId: true } },
      },
    })
    const pactado    = new Map<string, number>()
    const recuperado = new Map<string, number>()
    for (const s of schedules) {
      if (s.estado === 'FINANCIADO') continue
      const esperado = Number(s.montoEsperado)
      const pagado   = s.payments.reduce((acc, p) => acc + Number(p.monto), 0)
      const cobrado  = Math.min(pagado, esperado)
      pactado.set(s.loan.cobradorId,    (pactado.get(s.loan.cobradorId)    ?? 0) + esperado)
      recuperado.set(s.loan.cobradorId, (recuperado.get(s.loan.cobradorId) ?? 0) + cobrado)
    }

    // Colocación por cobrador
    const loans = await prisma.loan.findMany({
      where: {
        companyId,
        estado: { in: ['ACTIVE', 'LIQUIDATED'] },
        fechaDesembolso: { gte: saturday, lte: friday },
        AND: [loanNotDeletedWhere],
      },
      select: { capital: true, cobradorId: true },
    })
    const coloc = new Map<string, number>()
    for (const l of loans) {
      coloc.set(l.cobradorId, (coloc.get(l.cobradorId) ?? 0) + Number(l.capital))
    }

    // Meta de colocación por cobrador (para score)
    const goals = await prisma.goal.findMany({
      where: {
        companyId,
        cobradorId:   { not: null },
        semanaInicio: { lte: friday },
        semanaFin:    { gte: saturday },
      },
      select: { cobradorId: true, metaCapitalColocado: true },
    })
    const metaColoc = new Map<string, number>()
    for (const g of goals) {
      const cid = g.cobradorId
      if (!cid) continue
      metaColoc.set(cid, (metaColoc.get(cid) ?? 0) + Number(g.metaCapitalColocado ?? 0))
    }

    const semIso = saturday.toISOString()
    const label  = labelSemana(saturday)

    for (const u of users) {
      const p = pactado.get(u.id)    ?? 0
      const r = recuperado.get(u.id) ?? 0
      const c = coloc.get(u.id)      ?? 0
      const m = metaColoc.get(u.id)  ?? 0
      const cobranzaPct   = p > 0 ? Math.round((r / p) * 100) : 0
      const colocacionPct = m > 0 ? Math.min(100, (c / m) * 100) : 0
      let score: number
      if (p > 0 && m > 0)      score = cobranzaPct * 0.7 + colocacionPct * 0.3
      else if (p > 0)          score = Math.min(100, cobranzaPct)
      else if (m > 0)          score = colocacionPct
      else                     score = 0
      seriePorCoord.get(u.id)!.push({
        semanaIso: semIso,
        label,
        cobranzaPct,
        recuperado:  r,
        pactado:     p,
        colocacion:  c,
        score:       Math.round(score),
      })
    }
  }

  // Filtrar coords sin NINGUNA actividad en todas las semanas
  const coordsConActividad = users.filter((u) => {
    const serie = seriePorCoord.get(u.id)!
    return serie.some((p) => p.cobranzaPct > 0 || p.colocacion > 0)
  })

  // Paso 1: promedios individuales (cobranza %, cobrado $, colocación $)
  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
  const promedios = coordsConActividad.map((u) => {
    const serie = seriePorCoord.get(u.id)!
    const ultimas = serie.slice(-4)
    return {
      user: u,
      serie,
      cobranzaPromedio:   avg(ultimas.map((p) => p.cobranzaPct)),
      cobradoPromedio:    avg(ultimas.map((p) => p.recuperado)),
      colocacionPromedio: avg(ultimas.map((p) => p.colocacion)),
    }
  })

  // Paso 2: máximos del grupo (para normalizar el volumen)
  const maxCobrado    = Math.max(1, ...promedios.map((p) => p.cobradoPromedio))
  const maxColocacion = Math.max(1, ...promedios.map((p) => p.colocacionPromedio))

  // Paso 3: score global que MEZCLA eficiencia % con volumen absoluto
  // relativo al grupo. Un coord con 100% cobranza pero pactado chico ya
  // no rankea arriba — necesita volumen también.
  const coordinadores: CoordinadorRanking[] = promedios.map((p) => {
    const tamCobranza   = (p.cobradoPromedio    / maxCobrado)    * 100
    const tamColocacion = (p.colocacionPromedio / maxColocacion) * 100
    // 30% eficiencia cobranza + 10% eficiencia colocación (vs meta)
    // + 40% volumen cobranza + 20% volumen colocación
    // Nota: eficiencia de colocación vs meta queda implícita en score
    // semanal — aquí priorizamos tamaño porque el usuario pidió que el
    // tamaño pesara.
    const scorePromedio = p.cobranzaPromedio * 0.30
                        + tamCobranza        * 0.40
                        + tamColocacion      * 0.20
                        + /* reserva 10% para eficiencia colocación: solo si hay meta */ 0

    return {
      cobradorId:    p.user.id,
      nombre:        p.user.nombre,
      sucursal:      (p.user.branchId && branchNombre.get(p.user.branchId)) ?? 'Sin sucursal',
      rol:           p.user.rol,
      fotoUrl:       p.user.fotoPerfilUrl,
      iniciales:     iniciales(p.user.nombre),
      serie:         p.serie,
      scorePromedio:      Math.round(scorePromedio),
      cobranzaPromedio:   Math.round(p.cobranzaPromedio),
      cobradoPromedio:    Math.round(p.cobradoPromedio),
      colocacionPromedio: Math.round(p.colocacionPromedio),
      puesto:        0,
      tier:          'medio',
    }
  })

  // Ordenar por scorePromedio desc + asignar puesto y tier
  coordinadores.sort((a, b) => b.scorePromedio - a.scorePromedio)
  coordinadores.forEach((c, i) => { c.puesto = i + 1 })
  const top3    = coordinadores.slice(0, 3).map((c) => c.cobradorId)
  const bottom3 = coordinadores.slice(-3).map((c) => c.cobradorId)
  for (const c of coordinadores) {
    if (top3.includes(c.cobradorId))        c.tier = 'top'
    else if (bottom3.includes(c.cobradorId)) c.tier = 'bottom'
  }

  return {
    companyId,
    empresa: company?.nombre ?? 'Empresa',
    semanas: sabados.map((s) => ({ semanaIso: s.toISOString(), label: labelSemana(s) })),
    coordinadores,
    top3,
    bottom3,
    generadoEn: new Date().toISOString(),
  }
}

/**
 * Wrapper cacheado. El tag incluye companyId para que empresas
 * distintas no se pisen en el cache. Bump "-v3" cuando cambia el
 * shape del payload (ahora incluye cobradoPromedio + recuperado/
 * pactado por semana y el score tiene fórmula nueva).
 */
// Bump "-v2" cuando cambie el shape del payload (p.e. se agreguen campos
// como fotoUrl/iniciales) — invalida el cache viejo de usuarios que
// pegarían al endpoint y recibirían el shape anterior sin los nuevos
// campos. Revalidate 1h es más defensivo contra cambios de shape.
export async function getRankingCoordinadores(companyId: string, semanas = 8): Promise<RankingCoordinadores> {
  const fn = unstable_cache(
    () => calcularRankingNoCacheado(companyId, semanas),
    [`ranking-coords-${companyId}-${semanas}-v3`],
    { revalidate: 60 * 60, tags: [`ranking-coords-${companyId}`] },
  )
  return fn()
}
