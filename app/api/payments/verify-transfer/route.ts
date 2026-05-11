import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { createAuditLog } from '@/lib/audit'
import { generateTicketNumber, generateTicketQrData } from '@/lib/ticket-generator'
import { calcScoreEventType, calcDiasDiferencia, getScoreChange, aplicarCambioScore } from '@/lib/score-calculator'
import { todayMx } from '@/lib/timezone'
import { crearNotificacion, getDirectoresIds } from '@/lib/notifications'

const schema = z.object({
  paymentId: z.string().uuid(),
})

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, id: userId } = session.user

  // Quiénes pueden verificar transferencias:
  //   - DIRECTOR_GENERAL / DIRECTOR_COMERCIAL: autoridad máxima, sin
  //     restricción de sucursal.
  //   - GERENTE_ZONAL / GERENTE: solo en las sucursales de su zona.
  //   - SUPER_ADMIN: técnico.
  // Coordinadores y cobradores NO pueden verificar (capturan, no aprueban).
  const rolesPermitidos = ['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'GERENTE_ZONAL', 'GERENTE', 'SUPER_ADMIN']
  if (!rolesPermitidos.includes(rol)) {
    return NextResponse.json({ error: 'Sin permisos para verificar transferencias' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const { paymentId } = parsed.data

  // Scope de sucursal — gerente solo puede verificar pagos de su sucursal
  const branchScope: Record<string, unknown> = {}
  if (rol === 'GERENTE' || rol === 'GERENTE_ZONAL') {
    const branchIds = session.user.zonaBranchIds?.length
      ? session.user.zonaBranchIds
      : session.user.branchId ? [session.user.branchId] : null
    if (branchIds?.length) branchScope.branchId = { in: branchIds }
  }

  const payment = await prisma.payment.findFirst({
    where: {
      id: paymentId,
      metodoPago: 'TRANSFER',
      statusTransferencia: 'PENDIENTE',
      loan: { companyId: companyId!, ...branchScope },
    },
    include: {
      schedule: true,
      loan: {
        include: {
          client: true,
          branch: { select: { nombre: true } },
          schedule: { where: { estado: { in: ['PENDING', 'OVERDUE', 'PARTIAL'] } } },
        },
      },
    },
  })

  if (!payment || !payment.schedule) {
    return NextResponse.json({ error: 'Pago no encontrado o ya verificado' }, { status: 404 })
  }

  const verificador = await prisma.user.findFirst({
    where: { companyId: companyId!, email: session.user.email! },
  })

  const schedule = payment.schedule
  const loan = payment.loan
  const monto = Number(payment.monto)
  const cambio = Number(payment.cambioEntregado)

  const branchPrefix = loan.branch.nombre
    .split(' ')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 4)

  await prisma.$transaction(async (tx) => {
    const now = new Date()

    // ¿El schedule ya fue contabilizado por el flujo viejo (apply endpoint)?
    // Antes del fix de transferencias, los apply marcaban schedule.estado=PAID
    // y sumaban a CashRegister al instante. El backfill puso esos Payments
    // en PENDIENTE para que aparezcan en /transferencias y el Gerente Zonal
    // pueda cerrar el ciclo. Cuando ese gerente le da "Verificar":
    //   - Schedule ya está PAID y montoPagado cubre lo esperado → solo
    //     marcamos VERIFICADO. NO incrementamos caja/montoPagado de nuevo
    //     (sería doble conteo) ni creamos score/ticket (la cobranza ya pasó).
    //   - Schedule está PENDING/PARTIAL → flujo nuevo: verify es lo que
    //     contabiliza por primera vez (caja, score, ticket).
    const yaContabilizado =
      schedule.estado === 'PAID' &&
      Number(schedule.montoPagado) >= Number(schedule.montoEsperado)

    // 1. Marcar pago como verificado (siempre)
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        statusTransferencia: 'VERIFICADO',
        verificadoPorId: verificador?.id ?? userId,
        verificadoAt: now,
      },
    })

    if (yaContabilizado) {
      // Backfilled / contabilizado previamente → fin del flujo
      return
    }

    // 2. Actualizar estado del schedule (PAID/PARTIAL)
    const nuevoEstado = monto >= Number(schedule.montoEsperado) ? 'PAID' : 'PARTIAL'
    await tx.paymentSchedule.update({
      where: { id: schedule.id },
      data: {
        montoPagado: { increment: monto },
        estado: nuevoEstado,
        pagadoAt: nuevoEstado === 'PAID' ? now : null,
      },
    })

    // 3. ¿Todos los schedules pagados? → liquidar préstamo
    const pendingSchedules = loan.schedule.filter((s) => s.id !== schedule.id)
    if (pendingSchedules.length === 0 && nuevoEstado === 'PAID') {
      await tx.loan.update({
        where: { id: loan.id },
        data: { estado: 'LIQUIDATED' },
      })
    }

    // 4. Score del cliente (usando la fecha de captura del pago)
    const diasDiff = calcDiasDiferencia(schedule.fechaVencimiento, payment.fechaHora)
    const tipoEvento = calcScoreEventType(diasDiff)
    const cambioScore = getScoreChange(tipoEvento)
    const nuevoScore = aplicarCambioScore(loan.client.score, cambioScore)

    await tx.scoreEvent.create({
      data: {
        clientId: loan.clientId,
        loanId: loan.id,
        paymentId: payment.id,
        registradoPorId: payment.cobradorId,
        tipoEvento,
        diasDiferencia: diasDiff,
        cambioScore,
        scoreResultado: nuevoScore,
      },
    })

    await tx.client.update({
      where: { id: loan.clientId },
      data: { score: nuevoScore },
    })

    // 5. Caja del cobrador original (a la fecha de verificación, día CDMX)
    const fecha = todayMx()

    await tx.cashRegister.upsert({
      where: { cobradorId_fecha: { cobradorId: payment.cobradorId, fecha } },
      create: {
        cobradorId: payment.cobradorId,
        branchId: loan.branchId,
        fecha,
        cobradoEfectivo: 0,
        cobradoTarjeta: 0,
        cobradoTransferencia: monto,
        cambioEntregado: cambio,
      },
      update: {
        cobradoTransferencia: { increment: monto },
        cambioEntregado: { increment: cambio },
      },
    })

    // 6. Generar ticket
    const year = now.getFullYear()
    const numeroTicket = await generateTicketNumber(branchPrefix, year)
    const qrCode = generateTicketQrData(numeroTicket)

    await tx.ticket.create({
      data: {
        paymentId: payment.id,
        companyId: companyId!,
        branchId: loan.branchId,
        numeroTicket,
        impresoPorId: payment.cobradorId,
        qrCode,
      },
    })
  })

  createAuditLog({
    userId,
    accion: 'VERIFY_TRANSFER',
    tabla: 'Payment',
    registroId: paymentId,
    valoresNuevos: { statusTransferencia: 'VERIFICADO' },
  })

  // Notificaciones informativas: pago verificado (para la cobradora) y, si
  // el préstamo quedó liquidado con este pago, "préstamo liquidado".
  try {
    const clienteNombre = loan.client.nombreCompleto
    const quedoLiquidado = loan.schedule.filter((s) => s.id !== schedule.id).length === 0
    await crearNotificacion(prisma, {
      companyId: companyId!,
      destinatariosIds: [payment.cobradorId],
      tipo: 'PAGO_VERIFICADO',
      nivel: 'INFORMATIVA',
      titulo: 'Pago verificado por gerente',
      mensaje: `${clienteNombre} — transferencia de $${monto.toFixed(2)} verificada`,
      loanId: loan.id,
      clientId: loan.clientId,
    })
    if (quedoLiquidado) {
      const directores = await getDirectoresIds(prisma, companyId!)
      await crearNotificacion(prisma, {
        companyId: companyId!,
        destinatariosIds: [...directores, payment.cobradorId],
        tipo: 'PRESTAMO_LIQUIDADO',
        nivel: 'INFORMATIVA',
        titulo: 'Préstamo liquidado completamente',
        mensaje: `${clienteNombre} — terminó de pagar`,
        loanId: loan.id,
        clientId: loan.clientId,
      })
    }
  } catch (e) {
    console.error('[verify-transfer] notif failed:', e)
  }

  return NextResponse.json({ success: true })
}
