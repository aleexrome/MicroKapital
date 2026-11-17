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
  // Comparación entre el primer snapshot del día y el último.
  reduccionAcumuladaPct: number        // % de mora reducida desde 1er corte
  dineroReducido:        number        // $ de mora reducida desde 1er corte
  reduccionPromedioPorHora: number     // $ promedio por hora
  ultimoDeltaPct:        number        // % del último corte vs el anterior
  ultimoDeltaMonto:      number        // $ del último corte vs el anterior
  horasTranscurridas:    number        // horas entre primer y último corte
  // Proyección a cierre del día (20:00 CDMX) si la velocidad promedio
  // actual se mantiene. Útil para "a este ritmo terminaríamos con $X".
  moraProyectadaCierre:  number | null
}

export interface InterpretacionTiempoReal {
  // Tono general detectado por reglas.
  tono:     'positivo' | 'neutro' | 'preocupante'
  resumen:  string
  senales:  Array<{ titulo: string; texto: string }>
}

export interface ReporteTiempoRealCobranza {
  ahora:     string  // ISO
  companyId: string
  empresa:   string
  semana: {
    saturday: string
    friday:   string
  }
  snapshots:       SnapshotPublico[]
  indicadores:     IndicadoresTiempoReal | null
  interpretacion:  InterpretacionTiempoReal | null
}

/**
 * Calcula un snapshot "a la fuerza" y lo escribe. Reutilizable desde
 * el cron y desde la ruta on-demand.
 */
export async function escribirSnapshotCobranza(companyId: string): Promise<void> {
  const ahora = new Date()
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
        select: { monto: true },
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
    const pagado   = s.payments.reduce((acc, p) => acc + Number(p.monto), 0)
    const cobrado  = Math.min(pagado, esperado)
    pactadoSemana += esperado
    cobradoSemana += cobrado
    const yaVencio = s.fechaVencimiento.getTime() <= ahora.getTime()
    if (yaVencio) pactadoVencidoSemana += esperado
    // Mora = pendiente SCHEDULE POR SCHEDULE (misma lógica que
    // /reportes/ejecutivo). NO usar pactadoVencido - cobradoTotal:
    // esa resta cuenta pagos anticipados de schedules NO vencidos y
    // baja la mora artificialmente.
    if (yaVencio && s.estado !== 'PAID' && s.estado !== 'ADVANCE') {
      const pendiente = esperado - cobrado
      if (pendiente > 0) moraPendienteSemana += pendiente
    }
  }

  const loansDesembolsados = await prisma.loan.findMany({
    where: {
      companyId,
      estado: { in: ['ACTIVE', 'LIQUIDATED'] },
      fechaDesembolso: { gte: saturday, lte: friday },
      AND: [loanNotDeletedWhere],
    },
    select: { capital: true },
  })
  const colocacionSemana = loansDesembolsados.reduce((s, l) => s + Number(l.capital), 0)

  await prisma.metricSnapshot.create({
    data: {
      companyId,
      capturadoEn: ahora,
      cobradoSemana,
      pactadoSemana,
      pactadoVencidoSemana,
      moraPendienteSemana,
      colocacionSemana,
    },
  })
}

/**
 * Lee los snapshots que caen en el día calendario CDMX de `ahora` para
 * armar el feed horario. Antes de leer, si el último snapshot tiene
 * más de 25 min, dispara uno nuevo on-demand — así el dashboard tiene
 * datos frescos aunque el cron sea diario (Vercel Hobby no admite
 * frecuencias intra-día).
 */
export async function getCobranzaTiempoReal(companyId: string): Promise<ReporteTiempoRealCobranza> {
  const ahora = new Date()
  const saturday = getSaturday(ahora)
  const friday   = getFriday(saturday)

  // Rango del día calendario CDMX (00:00 CDMX → 23:59:59.999 CDMX).
  // CDMX = UTC-6 (sin DST). Postgres recibe UTC; calculamos a mano.
  const inicioDiaUtc = new Date(ahora)
  inicioDiaUtc.setUTCHours(0, 0, 0, 0)
  // 00:00 CDMX = 06:00 UTC. Si `ahora` ya pasó medianoche CDMX pero
  // aún no las 06:00 UTC, retrocedemos un día.
  const horaUtc = ahora.getUTCHours()
  if (horaUtc < 6) inicioDiaUtc.setUTCDate(inicioDiaUtc.getUTCDate() - 1)
  inicioDiaUtc.setUTCHours(6, 0, 0, 0)

  const finDiaUtc = new Date(inicioDiaUtc)
  finDiaUtc.setUTCDate(finDiaUtc.getUTCDate() + 1)

  // On-demand snapshot: solo durante horario laboral CDMX (8-20h) y si
  // el último registrado es más viejo que MAX_STALE_MINUTES. Evita
  // inundar la tabla cuando el dashboard está abierto en varios tabs.
  const horaMx = Number(new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    hour: '2-digit', hour12: false,
  }).format(ahora))
  if (horaMx >= 8 && horaMx < 20) {
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

  const [company, rawSnaps] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { nombre: true } }),
    prisma.metricSnapshot.findMany({
      where:  { companyId, capturadoEn: { gte: inicioDiaUtc, lt: finDiaUtc } },
      orderBy: { capturadoEn: 'asc' },
    }),
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

  return {
    ahora:     ahora.toISOString(),
    companyId,
    empresa:   company?.nombre ?? 'Empresa',
    semana:    { saturday: saturday.toISOString(), friday: friday.toISOString() },
    snapshots,
    indicadores,
    interpretacion,
  }
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

  // Proyección a cierre del día (20:00 CDMX = 02:00 UTC del día siguiente).
  // Si la velocidad promedio es ≤ 0 (la mora creció), no proyectamos.
  let moraProyectadaCierre: number | null = null
  if (reduccionPromedioPorHora > 0) {
    const cierreUtc = new Date(ahora)
    cierreUtc.setUTCHours(0, 0, 0, 0)
    // 20:00 CDMX = 02:00 UTC del día SIGUIENTE al calendario CDMX.
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

  // Tendencia del día.
  if (ind.reduccionAcumuladaPct >= 25) {
    senales.push({
      titulo: 'Buen arranque',
      texto:  `La mora bajó ${ind.reduccionAcumuladaPct}% en ${ind.horasTranscurridas}h — ritmo fuerte.`,
    })
  } else if (ind.reduccionAcumuladaPct >= 10) {
    senales.push({
      titulo: 'Avance moderado',
      texto:  `La mora bajó ${ind.reduccionAcumuladaPct}% desde el primer corte del día.`,
    })
  } else if (ind.reduccionAcumuladaPct > 0) {
    senales.push({
      titulo: 'Avance lento',
      texto:  `Solo ${ind.reduccionAcumuladaPct}% de reducción — hay que presionar a los coords.`,
    })
  } else {
    senales.push({
      titulo: 'Sin avance',
      texto:  `La mora no está bajando. Revisar rutas que no han entregado parcial.`,
    })
  }

  // Aceleración vs promedio.
  if (snaps.length >= 3) {
    const velPromedio = ind.reduccionPromedioPorHora
    const horaUltimoVsPrevio = (new Date(snaps[snaps.length - 1].capturadoEn).getTime()
                             - new Date(snaps[snaps.length - 2].capturadoEn).getTime()) / 36e5
    const velUltimo = horaUltimoVsPrevio > 0 ? ind.ultimoDeltaMonto / horaUltimoVsPrevio : 0
    if (velPromedio > 0 && velUltimo > velPromedio * 1.3) {
      senales.push({
        titulo: 'Aceleración',
        texto:  `El último corte reduce a $${Math.round(velUltimo).toLocaleString('es-MX')}/h vs promedio $${velPromedio.toLocaleString('es-MX')}/h.`,
      })
    } else if (velUltimo <= 0 && velPromedio > 0) {
      senales.push({
        titulo: 'Desaceleración',
        texto:  `El último corte no redujo mora. Verificar si algún coord detuvo ruta.`,
      })
    }
  }

  // Proyección.
  if (ind.moraProyectadaCierre !== null) {
    senales.push({
      titulo: 'Proyección a cierre',
      texto:  `A este ritmo, la mora cerraría hoy en ~$${ind.moraProyectadaCierre.toLocaleString('es-MX')}.`,
    })
  }

  const tono: InterpretacionTiempoReal['tono'] =
    ind.reduccionAcumuladaPct >= 20 ? 'positivo'
    : ind.reduccionAcumuladaPct >= 5 ? 'neutro'
    : 'preocupante'

  const resumen =
    tono === 'positivo'
      ? 'La tendencia de hoy es positiva: la mora está disminuyendo de manera sostenida.'
      : tono === 'neutro'
      ? 'La cobranza avanza, pero el ritmo es moderado. Hay espacio para presionar.'
      : 'La cobranza va lenta o estancada. Pedir avance a coords con mora vencida.'

  return { tono, resumen, senales }
}
