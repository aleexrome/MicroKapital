import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSaturday, getFriday } from '@/lib/week-utils'
import { loanNotDeletedWhere } from '@/lib/access'

/**
 * Ranking de coordinadores — reporte de RH para compartir al equipo.
 *
 * Para las últimas N semanas MK (sáb–vie), calcula por cada cobrador:
 *   - cobranzaPct = recuperado / pactado (misma lógica que /rutas)
 *   - colocacion  = Σ capital desembolsado en la semana
 *   - score       = cobranzaPct * 0.7 + colocacionPct * 0.3
 *                   (si falta meta usa solo cobranzaPct)
 *
 * El score promedio de las últimas 4 semanas define el ranking actual
 * (top 3 y bottom 3). Se filtran cobradores sin actividad en el período
 * para no ensuciar la gráfica con ceros.
 *
 * Caché 24h vía unstable_cache — el reporte se actualiza una vez al día,
 * no en tiempo real (es un ranking histórico, no operativo).
 */

export interface PuntoSemana {
  semanaIso:    string   // ISO del sábado (00:00 UTC)
  label:        string   // "4-10 nov"
  cobranzaPct:  number
  colocacion:   number
  score:        number
}

export interface CoordinadorRanking {
  cobradorId:    string
  nombre:        string
  sucursal:      string
  rol:           string
  serie:         PuntoSemana[]
  // Promedio de últimas 4 semanas para ordenar ranking.
  scorePromedio: number
  cobranzaPromedio: number
  colocacionPromedio: number
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
      where: { companyId, activo: true, rol: { in: ['COBRADOR', 'COORDINADOR'] } },
      select: { id: true, nombre: true, rol: true, branchId: true },
    }),
    prisma.branch.findMany({
      where: { companyId, activa: true },
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

  // Promedios últimas 4 semanas (o menos si hay menos)
  const coordinadores: CoordinadorRanking[] = coordsConActividad.map((u) => {
    const serie = seriePorCoord.get(u.id)!
    const ultimas = serie.slice(-4)
    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
    const scorePromedio      = Math.round(avg(ultimas.map((p) => p.score)))
    const cobranzaPromedio   = Math.round(avg(ultimas.map((p) => p.cobranzaPct)))
    const colocacionPromedio = Math.round(avg(ultimas.map((p) => p.colocacion)))
    return {
      cobradorId:    u.id,
      nombre:        u.nombre,
      sucursal:      (u.branchId && branchNombre.get(u.branchId)) ?? 'Sin sucursal',
      rol:           u.rol,
      serie,
      scorePromedio,
      cobranzaPromedio,
      colocacionPromedio,
      puesto:        0,   // asignado abajo
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
 * Wrapper cacheado (24h). El tag incluye companyId para que empresas
 * distintas no se pisen en el cache.
 */
export async function getRankingCoordinadores(companyId: string, semanas = 8): Promise<RankingCoordinadores> {
  const fn = unstable_cache(
    () => calcularRankingNoCacheado(companyId, semanas),
    [`ranking-coords-${companyId}-${semanas}`],
    { revalidate: 60 * 60 * 24, tags: [`ranking-coords-${companyId}`] },
  )
  return fn()
}
