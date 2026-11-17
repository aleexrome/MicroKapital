import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/prisma'
import { getSaturday, getFriday } from '@/lib/week-utils'
import { loanNotDeletedWhere } from '@/lib/access'

// Antigüedad máxima de un snapshot antes de que la ruta de lectura
// dispare uno nuevo. 25 min < intervalo nominal de 30 min, así se
// garantiza al menos un corte por media hora cuando el dashboard
// está en uso, sin generar snapshots en cada request.
const MAX_STALE_MINUTES = 25

export interface SnapshotPublico {
  capturadoEn:          string  // ISO
  cobradoSemana:        number
  pactadoSemana:        number
  pactadoVencidoSemana: number
  moraPendienteSemana:  number
  colocacionSemana:     number
}

export interface IndicadoresTiempoReal {
  reduccionAcumuladaPct: number
  dineroReducido:        number
  reduccionPromedioPorHora: number
  ultimoDeltaPct:        number
  ultimoDeltaMonto:      number
  horasTranscurridas:    number
  moraProyectadaCierre:  number | null
}

export interface InterpretacionTiempoReal {
  tono:     'positivo' | 'neutro' | 'preocupante'
  resumen:  string
  senales:  Array<{ titulo: string; texto: string }>
}

export interface DiaSemanaPunto {
  // Un punto por día de la semana MK (sáb–vie).
  fechaIso:    string   // 00:00 CDMX del día
  nombreCorto: string   // "sáb 15", "dom 16", ...
  esHoy:       boolean
  esFuturo:    boolean
  // Valores al cierre del día (23:59 CDMX), o "al momento ahora" si es hoy.
  cobradoAlCierre:       number
  pactadoAlCierre:       number   // solo lo que vencía ese día
  moraPendienteAlCierre: number
}

export interface ReporteTiempoRealCobranza {
  ahora:     string
  companyId: string
  empresa:   string
  semana: {
    saturday: string
    friday:   string
  }
  snapshots:      SnapshotPublico[]
  diasSemana:     DiaSemanaPunto[]
  indicadores:    IndicadoresTiempoReal | null
  interpretacion: InterpretacionTiempoReal | null
  // Párrafo narrativo generado por Claude Haiku con lectura ejecutiva
  // del día. Null si no hay API key o si la llamada falló — la vista
  // cae al bloque de señales por reglas (interpretacion).
  narrativaIa:    string | null
}

interface MetricasCobranza {
  cobradoSemana:        number
  pactadoSemana:        number
  pactadoVencidoSemana: number
  moraPendienteSemana:  number
  colocacionSemana:     number
}

/**
 * Calcula el estado de cobranza de la semana MK en curso "al momento
 * `ahora`". Reconstruye la misma lógica que /reportes/ejecutivo pero
 * respetando un punto en el tiempo: para pactado-vencido mira
 * `fechaVencimiento <= ahora`, para cobrado suma solo `Payment.fechaHora
 * <= ahora`. Esto hace que sirva tanto para "ahora mismo" (cron,
 * on-demand) como para backfill de horas pasadas del día.
 */
export async function calcularMetricasAt(companyId: string, ahora: Date): Promise<MetricasCobranza> {
  const saturday = getSaturday(ahora)
  const friday   = getFriday(saturday)

  const schedulesSemana = await prisma.paymentSchedule.findMany({
    where: {
      fechaVencimiento: { gte: saturday, lte: friday },
      loan: {
        companyId,
        estado: { in: ['ACTIVE', 'LIQUIDATED', 'DEFAULTED'] },
        AND: [loanNotDeletedWhere],
      },
    },
    select: {
      fechaVencimiento: true,
      montoEsperado:    true,
      estado:           true,
      payments: {
        where:  { canceledAt: null },
        select: { monto: true, fechaHora: true },
      },
    },
  })

  let pactadoSemana        = 0
  let cobradoSemana        = 0
  let pactadoVencidoSemana = 0
  let moraPendienteSemana  = 0
  for (const s of schedulesSemana) {
    if (s.estado === 'FINANCIADO') continue
    const esperado = Number(s.montoEsperado)
    // Solo cuentan los pagos cuya fechaHora ≤ ahora (para reconstruir
    // el estado del momento solicitado, no el de "hoy").
    const pagadoHastaAhora = s.payments
      .filter((p) => p.fechaHora.getTime() <= ahora.getTime())
      .reduce((acc, p) => acc + Number(p.monto), 0)
    const cobrado = Math.min(pagadoHastaAhora, esperado)
    pactadoSemana += esperado
    cobradoSemana += cobrado
    const yaVencio = s.fechaVencimiento.getTime() <= ahora.getTime()
    if (yaVencio) {
      pactadoVencidoSemana += esperado
      // Mora: pendiente schedule-por-schedule de los vencidos.
      // Excluye PAID/ADVANCE (ya completos). No se usa la resta
      // pactadoVencido − cobradoTotal porque incluiría pagos
      // anticipados de schedules no vencidos y bajaría la mora.
      if (s.estado !== 'PAID' && s.estado !== 'ADVANCE') {
        const pendiente = esperado - cobrado
        if (pendiente > 0) moraPendienteSemana += pendiente
      }
    }
  }

  const loansDesembolsados = await prisma.loan.findMany({
    where: {
      companyId,
      estado: { in: ['ACTIVE', 'LIQUIDATED'] },
      fechaDesembolso: { gte: saturday, lte: ahora < friday ? ahora : friday },
      AND: [loanNotDeletedWhere],
    },
    select: { capital: true },
  })
  const colocacionSemana = loansDesembolsados.reduce((s, l) => s + Number(l.capital), 0)

  return {
    pactadoSemana,
    cobradoSemana,
    pactadoVencidoSemana,
    moraPendienteSemana,
    colocacionSemana,
  }
}

/** Escribe un snapshot "ahora mismo". Reusable desde el cron. */
export async function escribirSnapshotCobranza(companyId: string): Promise<void> {
  const ahora = new Date()
  const m = await calcularMetricasAt(companyId, ahora)
  await prisma.metricSnapshot.create({
    data: { companyId, capturadoEn: ahora, ...m },
  })
}

/**
 * Para cada hora en punto del día de hoy (CDMX) desde las 8am hasta
 * la hora anterior a `ahora`, verifica si existe snapshot a esa hora
 * y, si no, lo calcula y escribe. Permite ver una gráfica completa
 * desde el primer uso del dashboard, reconstruyendo con los datos
 * crudos. Idempotente: no inserta si ya existe uno dentro de ±15 min
 * de cada hora en punto.
 */
async function backfillSnapshotsHoyHoras(companyId: string, ahora: Date): Promise<number> {
  // Inicio del día CDMX (8:00 CDMX = 14:00 UTC).
  const inicioDiaUtc = inicioDiaCdmxEnUtc(ahora)
  const inicioLaboralUtc = new Date(inicioDiaUtc)
  inicioLaboralUtc.setUTCHours(inicioLaboralUtc.getUTCHours() + 8) // 8am CDMX = 14 UTC

  // Qué snapshots ya existen hoy (para no duplicar).
  const existentes = await prisma.metricSnapshot.findMany({
    where:  { companyId, capturadoEn: { gte: inicioDiaUtc, lte: ahora } },
    select: { capturadoEn: true },
  })
  const existentesTs = existentes.map((e) => e.capturadoEn.getTime())

  const ahoraMs = ahora.getTime()
  const horas: Date[] = []
  for (let t = inicioLaboralUtc.getTime(); t < ahoraMs - 30 * 60_000; t += 60 * 60_000) {
    horas.push(new Date(t))
  }

  let creados = 0
  for (const hora of horas) {
    // Idempotencia: ¿ya hay snapshot dentro de ±15 min de esta hora?
    const yaExiste = existentesTs.some((ts) => Math.abs(ts - hora.getTime()) < 15 * 60_000)
    if (yaExiste) continue
    try {
      const m = await calcularMetricasAt(companyId, hora)
      await prisma.metricSnapshot.create({
        data: { companyId, capturadoEn: hora, ...m },
      })
      creados++
    } catch (e) {
      console.error('[tiempoReal] backfill falló en', hora.toISOString(), e)
    }
  }
  return creados
}

/**
 * Serie "un punto por día" de la semana MK en curso (sáb–vie).
 * Para cada día, calcula el estado al cierre (23:59 CDMX) o "al
 * momento ahora" si es el día actual. Días futuros quedan en 0.
 */
async function calcularSerieSemanal(companyId: string, ahora: Date): Promise<DiaSemanaPunto[]> {
  const saturday = getSaturday(ahora)

  const puntos: DiaSemanaPunto[] = []
  for (let i = 0; i < 7; i++) {
    const inicioDia = new Date(saturday)
    inicioDia.setUTCDate(inicioDia.getUTCDate() + i)
    const finDia = new Date(inicioDia)
    finDia.setUTCDate(finDia.getUTCDate() + 1)
    finDia.setUTCMilliseconds(-1)

    const esHoy = inicioDia.getTime() <= ahora.getTime() && ahora.getTime() <= finDia.getTime()
    const esFuturo = inicioDia.getTime() > ahora.getTime()
    const corte = esFuturo ? inicioDia : esHoy ? ahora : finDia

    const nombreCorto = inicioDia.toLocaleDateString('es-MX', {
      timeZone: 'UTC',
      weekday: 'short', day: '2-digit',
    })

    if (esFuturo) {
      puntos.push({
        fechaIso: inicioDia.toISOString(),
        nombreCorto,
        esHoy: false,
        esFuturo: true,
        cobradoAlCierre: 0,
        pactadoAlCierre: 0,
        moraPendienteAlCierre: 0,
      })
      continue
    }

    // Lo que vencía EN ese día — subset del pactado de la semana.
    const schedulesDia = await prisma.paymentSchedule.findMany({
      where: {
        fechaVencimiento: { gte: inicioDia, lte: finDia },
        loan: {
          companyId,
          estado: { in: ['ACTIVE', 'LIQUIDATED', 'DEFAULTED'] },
          AND: [loanNotDeletedWhere],
        },
      },
      select: {
        montoEsperado: true,
        estado:        true,
        payments: {
          where:  { canceledAt: null },
          select: { monto: true, fechaHora: true },
        },
      },
    })

    let cobradoAlCierre = 0
    let pactadoAlCierre = 0
    let moraPendienteAlCierre = 0
    for (const s of schedulesDia) {
      if (s.estado === 'FINANCIADO') continue
      const esperado = Number(s.montoEsperado)
      const pagadoHastaCorte = s.payments
        .filter((p) => p.fechaHora.getTime() <= corte.getTime())
        .reduce((acc, p) => acc + Number(p.monto), 0)
      const cobrado = Math.min(pagadoHastaCorte, esperado)
      pactadoAlCierre += esperado
      cobradoAlCierre += cobrado
      if (s.estado !== 'PAID' && s.estado !== 'ADVANCE') {
        const pendiente = esperado - cobrado
        if (pendiente > 0) moraPendienteAlCierre += pendiente
      }
    }

    puntos.push({
      fechaIso: inicioDia.toISOString(),
      nombreCorto,
      esHoy,
      esFuturo: false,
      cobradoAlCierre,
      pactadoAlCierre,
      moraPendienteAlCierre,
    })
  }
  return puntos
}

function inicioDiaCdmxEnUtc(ahora: Date): Date {
  // 00:00 CDMX = 06:00 UTC del mismo día calendario CDMX.
  const d = new Date(ahora)
  d.setUTCHours(0, 0, 0, 0)
  if (ahora.getUTCHours() < 6) d.setUTCDate(d.getUTCDate() - 1)
  d.setUTCHours(6, 0, 0, 0)
  return d
}

/**
 * Lee los snapshots del día calendario CDMX. Antes:
 *   1. Backfill de las horas en punto pasadas (si no se habían
 *      capturado antes).
 *   2. On-demand snapshot si el último tiene >25 min.
 * Así el dashboard muestra gráfica completa desde el primer uso,
 * y datos frescos cada vez que se abre.
 */
export async function getCobranzaTiempoReal(companyId: string): Promise<ReporteTiempoRealCobranza> {
  const ahora = new Date()
  const saturday = getSaturday(ahora)
  const friday   = getFriday(saturday)

  const inicioDiaUtc = inicioDiaCdmxEnUtc(ahora)
  const finDiaUtc    = new Date(inicioDiaUtc)
  finDiaUtc.setUTCDate(finDiaUtc.getUTCDate() + 1)

  const horaMx = Number(new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    hour: '2-digit', hour12: false,
  }).format(ahora))

  if (horaMx >= 8 && horaMx < 20) {
    // Backfill de horas pasadas del día (una sola vez por request;
    // idempotente si ya existen).
    try { await backfillSnapshotsHoyHoras(companyId, ahora) }
    catch (e) { console.error('[tiempoReal] backfill falló:', e) }

    // On-demand snapshot "ahora" si el último es viejo.
    const ultimo = await prisma.metricSnapshot.findFirst({
      where:  { companyId },
      orderBy: { capturadoEn: 'desc' },
      select: { capturadoEn: true },
    })
    const minutosDesdeUltimo = ultimo
      ? (ahora.getTime() - ultimo.capturadoEn.getTime()) / 60000
      : Infinity
    if (minutosDesdeUltimo > MAX_STALE_MINUTES) {
      try { await escribirSnapshotCobranza(companyId) }
      catch (e) { console.error('[tiempoReal] on-demand snapshot falló:', e) }
    }
  }

  const [company, rawSnaps, diasSemana] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { nombre: true } }),
    prisma.metricSnapshot.findMany({
      where:  { companyId, capturadoEn: { gte: inicioDiaUtc, lt: finDiaUtc } },
      orderBy: { capturadoEn: 'asc' },
    }),
    calcularSerieSemanal(companyId, ahora),
  ])

  const snapshots: SnapshotPublico[] = rawSnaps.map((s) => ({
    capturadoEn:          s.capturadoEn.toISOString(),
    cobradoSemana:        Number(s.cobradoSemana),
    pactadoSemana:        Number(s.pactadoSemana),
    pactadoVencidoSemana: Number(s.pactadoVencidoSemana),
    moraPendienteSemana:  Number(s.moraPendienteSemana),
    colocacionSemana:     Number(s.colocacionSemana),
  }))

  const indicadores    = computeIndicadores(snapshots, ahora)
  const interpretacion = computeInterpretacion(snapshots, indicadores)
  const narrativaIa    = await generarNarrativaClaude(snapshots, indicadores, diasSemana).catch(() => null)

  return {
    ahora:     ahora.toISOString(),
    companyId,
    empresa:   company?.nombre ?? 'Empresa',
    semana:    { saturday: saturday.toISOString(), friday: friday.toISOString() },
    snapshots,
    diasSemana,
    indicadores,
    interpretacion,
    narrativaIa,
  }
}

/**
 * Pide a Claude Haiku una lectura ejecutiva del día (2-3 oraciones,
 * en español, tono gerencial). Barato (~$0.001 por request con Haiku)
 * y cacheable a nivel cliente con el refresh de 2 min.
 * Falla silenciosa: devuelve null si no hay API key o si la llamada
 * se cae — la vista muestra entonces solo las señales por reglas.
 */
async function generarNarrativaClaude(
  snaps: SnapshotPublico[],
  ind:   IndicadoresTiempoReal | null,
  dias:  DiaSemanaPunto[],
): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (snaps.length === 0) return null

  const ultimo  = snaps[snaps.length - 1]
  const primero = snaps[0]
  const diasFmt = dias
    .filter((d) => !d.esFuturo)
    .map((d) => `${d.nombreCorto}: mora=$${d.moraPendienteAlCierre.toLocaleString('es-MX')}, cobrado=$${d.cobradoAlCierre.toLocaleString('es-MX')} / pactado=$${d.pactadoAlCierre.toLocaleString('es-MX')}${d.esHoy ? ' (HOY, en curso)' : ''}`)
    .join('\n')
  const snapsFmt = snaps
    .map((s) => {
      const hora = new Date(s.capturadoEn).toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: false })
      return `${hora}: mora=$${s.moraPendienteSemana.toLocaleString('es-MX')}`
    })
    .join('\n')

  const prompt = `Eres asistente del Director General de MicroKapital Financiera. Dame una lectura ejecutiva de ~3 oraciones sobre el comportamiento de cobranza de hoy. Usa segunda persona plural ("vamos", "nos falta"), tono profesional pero directo, sin saludos ni cierres. Menciona: (1) tendencia observada, (2) comparación entre hoy y los días anteriores de la semana, (3) una acción concreta si procede. Nada de bullets, un solo párrafo.

DATOS DE HOY (snapshots horarios, mora pendiente de la semana en pesos):
${snapsFmt}

SEMANA EN CURSO (lunes a viernes MK):
${diasFmt}

INDICADORES:
- Mora inicial del día: $${primero.moraPendienteSemana.toLocaleString('es-MX')}
- Mora actual: $${ultimo.moraPendienteSemana.toLocaleString('es-MX')}
${ind ? `- Reducción acumulada: ${ind.reduccionAcumuladaPct}%
- Dinero reducido: $${ind.dineroReducido.toLocaleString('es-MX')}
- Velocidad promedio: $${ind.reduccionPromedioPorHora.toLocaleString('es-MX')}/h
- Proyección a cierre (20h CDMX): ${ind.moraProyectadaCierre !== null ? `$${ind.moraProyectadaCierre.toLocaleString('es-MX')}` : 'no disponible'}` : ''}`

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const res = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  })
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text).join('\n').trim()
  return text || null
}

function computeIndicadores(snaps: SnapshotPublico[], ahora: Date): IndicadoresTiempoReal | null {
  if (snaps.length < 2) return null
  const primero = snaps[0]
  const ultimo  = snaps[snaps.length - 1]
  const previo  = snaps[snaps.length - 2]

  const horasTranscurridas = Math.max(
    0.01,
    (new Date(ultimo.capturadoEn).getTime() - new Date(primero.capturadoEn).getTime()) / 36e5,
  )
  const dineroReducido         = primero.moraPendienteSemana - ultimo.moraPendienteSemana
  const reduccionAcumuladaPct  = primero.moraPendienteSemana > 0
    ? (dineroReducido / primero.moraPendienteSemana) * 100
    : 0
  const reduccionPromedioPorHora = dineroReducido / horasTranscurridas

  const ultimoDeltaMonto = previo.moraPendienteSemana - ultimo.moraPendienteSemana
  const ultimoDeltaPct   = previo.moraPendienteSemana > 0
    ? (ultimoDeltaMonto / previo.moraPendienteSemana) * 100
    : 0

  let moraProyectadaCierre: number | null = null
  if (reduccionPromedioPorHora > 0) {
    const cierreUtc = new Date(ahora)
    cierreUtc.setUTCHours(0, 0, 0, 0)
    if (ahora.getUTCHours() >= 2) cierreUtc.setUTCDate(cierreUtc.getUTCDate() + 1)
    cierreUtc.setUTCHours(2, 0, 0, 0)
    const horasRestantes = Math.max(0, (cierreUtc.getTime() - ahora.getTime()) / 36e5)
    moraProyectadaCierre = Math.max(0, ultimo.moraPendienteSemana - reduccionPromedioPorHora * horasRestantes)
  }

  return {
    reduccionAcumuladaPct: Math.round(reduccionAcumuladaPct * 10) / 10,
    dineroReducido:        Math.round(dineroReducido),
    reduccionPromedioPorHora: Math.round(reduccionPromedioPorHora),
    ultimoDeltaPct:        Math.round(ultimoDeltaPct * 10) / 10,
    ultimoDeltaMonto:      Math.round(ultimoDeltaMonto),
    horasTranscurridas:    Math.round(horasTranscurridas * 10) / 10,
    moraProyectadaCierre:  moraProyectadaCierre !== null ? Math.round(moraProyectadaCierre) : null,
  }
}

function computeInterpretacion(
  snaps: SnapshotPublico[],
  ind: IndicadoresTiempoReal | null,
): InterpretacionTiempoReal | null {
  if (!ind || snaps.length < 2) return null
  const senales: InterpretacionTiempoReal['senales'] = []

  if (ind.reduccionAcumuladaPct >= 25) {
    senales.push({ titulo: 'Buen arranque', texto: `La mora bajó ${ind.reduccionAcumuladaPct}% en ${ind.horasTranscurridas}h — ritmo fuerte.` })
  } else if (ind.reduccionAcumuladaPct >= 10) {
    senales.push({ titulo: 'Avance moderado', texto: `La mora bajó ${ind.reduccionAcumuladaPct}% desde el primer corte del día.` })
  } else if (ind.reduccionAcumuladaPct > 0) {
    senales.push({ titulo: 'Avance lento', texto: `Solo ${ind.reduccionAcumuladaPct}% de reducción — hay que presionar a los coords.` })
  } else {
    senales.push({ titulo: 'Sin avance', texto: `La mora no está bajando. Revisar rutas que no han entregado parcial.` })
  }

  if (snaps.length >= 3) {
    const velPromedio = ind.reduccionPromedioPorHora
    const horaUltimoVsPrevio = (new Date(snaps[snaps.length - 1].capturadoEn).getTime()
                             - new Date(snaps[snaps.length - 2].capturadoEn).getTime()) / 36e5
    const velUltimo = horaUltimoVsPrevio > 0 ? ind.ultimoDeltaMonto / horaUltimoVsPrevio : 0
    if (velPromedio > 0 && velUltimo > velPromedio * 1.3) {
      senales.push({ titulo: 'Aceleración', texto: `El último corte reduce a $${Math.round(velUltimo).toLocaleString('es-MX')}/h vs promedio $${velPromedio.toLocaleString('es-MX')}/h.` })
    } else if (velUltimo <= 0 && velPromedio > 0) {
      senales.push({ titulo: 'Desaceleración', texto: `El último corte no redujo mora. Verificar si algún coord detuvo ruta.` })
    }
  }

  if (ind.moraProyectadaCierre !== null) {
    senales.push({ titulo: 'Proyección a cierre', texto: `A este ritmo, la mora cerraría hoy en ~$${ind.moraProyectadaCierre.toLocaleString('es-MX')}.` })
  }

  const tono: InterpretacionTiempoReal['tono'] =
    ind.reduccionAcumuladaPct >= 20 ? 'positivo'
    : ind.reduccionAcumuladaPct >= 5 ? 'neutro'
    : 'preocupante'

  const resumen =
    tono === 'positivo' ? 'La tendencia de hoy es positiva: la mora está disminuyendo de manera sostenida.'
    : tono === 'neutro' ? 'La cobranza avanza, pero el ritmo es moderado. Hay espacio para presionar.'
    : 'La cobranza va lenta o estancada. Pedir avance a coords con mora vencida.'

  return { tono, resumen, senales }
}
