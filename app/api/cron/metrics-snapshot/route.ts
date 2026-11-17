import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSaturday, getFriday } from '@/lib/week-utils'
import { loanNotDeletedWhere } from '@/lib/access'

/**
 * Cron: cada 30 minutos durante horario laboral CDMX (8–20h) guarda
 * un snapshot del estado de cobranza de la semana MK en curso para
 * cada company activa.
 *
 * Fuera de ese horario el cron corre pero no escribe (early-return),
 * así el feed del dashboard no se ensucia con filas de madrugada que
 * no aportan señal.
 *
 * Métricas capturadas (misma semántica que /rutas y /reportes/ejecutivo):
 *   - cobradoSemana: Σ Payment.monto capada por montoEsperado del
 *     schedule, para schedules de la semana en curso.
 *   - pactadoSemana: Σ montoEsperado de schedules con vencimiento
 *     en la semana, excluyendo FINANCIADO.
 *   - pactadoVencidoSemana: subset del anterior cuyo vencimiento
 *     ya pasó al momento de la captura.
 *   - moraPendienteSemana: pactadoVencidoSemana − cobradoSemana
 *     (lo que YA debería estar cobrado y no lo está). Esta es la
 *     curva principal del dashboard — cae a lo largo del día.
 *   - colocacionSemana: Σ capital de loans desembolsados en la semana.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Filtro de horario CDMX: solo escribir entre 8:00 y 20:00 (inclusivo
  // del rango laboral). Fuera de ese rango, el cron responde OK sin
  // tocar la DB. Vercel cron corre en UTC — usamos Intl para derivar
  // la hora CDMX del momento sin arrastrar timezone math a mano.
  const ahora = new Date()
  const horaMx = Number(
    new Intl.DateTimeFormat('es-MX', {
      timeZone: 'America/Mexico_City',
      hour: '2-digit',
      hour12: false,
    }).format(ahora),
  )
  if (horaMx < 8 || horaMx >= 20) {
    return NextResponse.json({ skipped: true, horaMx, motivo: 'fuera_horario_laboral' })
  }

  const saturday = getSaturday(ahora)
  const friday   = getFriday(saturday)

  const companies = await prisma.company.findMany({
    where:  { activa: true },
    select: { id: true, nombre: true },
  })

  const resultados: Array<{ companyId: string; moraPendienteSemana: number; cobradoSemana: number }> = []

  for (const company of companies) {
    // Pactado + cobrado + vencido-a-la-fecha
    const schedulesSemana = await prisma.paymentSchedule.findMany({
      where: {
        fechaVencimiento: { gte: saturday, lte: friday },
        loan: {
          companyId: company.id,
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
    for (const s of schedulesSemana) {
      if (s.estado === 'FINANCIADO') continue
      const esperado = Number(s.montoEsperado)
      const pagado   = s.payments.reduce((acc, p) => acc + Number(p.monto), 0)
      const cobrado  = Math.min(pagado, esperado)
      pactadoSemana += esperado
      cobradoSemana += cobrado
      if (s.fechaVencimiento.getTime() <= ahora.getTime()) {
        pactadoVencidoSemana += esperado
      }
    }
    // Mora pendiente = pactado que YA debió cobrarse y aún no, capado
    // al cobrado total (porque un pago anticipado reduce vencido).
    const moraPendienteSemana = Math.max(0, pactadoVencidoSemana - cobradoSemana)

    // Colocación de la semana
    const loansDesembolsados = await prisma.loan.findMany({
      where: {
        companyId: company.id,
        estado: { in: ['ACTIVE', 'LIQUIDATED'] },
        fechaDesembolso: { gte: saturday, lte: friday },
        AND: [loanNotDeletedWhere],
      },
      select: { capital: true },
    })
    const colocacionSemana = loansDesembolsados.reduce((s, l) => s + Number(l.capital), 0)

    await prisma.metricSnapshot.create({
      data: {
        companyId:            company.id,
        capturadoEn:          ahora,
        cobradoSemana,
        pactadoSemana,
        pactadoVencidoSemana,
        moraPendienteSemana,
        colocacionSemana,
      },
    })
    resultados.push({ companyId: company.id, moraPendienteSemana, cobradoSemana })
  }

  return NextResponse.json({
    timestamp: ahora.toISOString(),
    horaMx,
    semana: { saturday: saturday.toISOString(), friday: friday.toISOString() },
    snapshots: resultados,
  })
}
