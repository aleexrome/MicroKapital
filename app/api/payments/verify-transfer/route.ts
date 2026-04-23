import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { createAuditLog } from '@/lib/audit'
import { generateTicketNumber, generateTicketQrData } from '@/lib/ticket-generator'
import { calcScoreEventType, calcDiasDiferencia, getScoreChange, aplicarCambioScore } from '@/lib/score-calculator'

const schema = z.object({
  paymentId: z.string().uuid(),
})

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, id: userId } = session.user

  // Solo Gerente Zonal/Gerente y Super Admin pueden verificar transferencias
  // Los directores y coordinadores NO pueden aprobar
  const rolesPermitidos = ['GERENTE_ZONAL', 'GERENTE', 'SUPER_ADMIN']
  if (!rolesPermitidos.includes(rol)) {
    return NextResponse.json({ error: 'Sin permisos — solo el Gerente y el Super Admin pueden verificar transferencias' }, { status: 403 })
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

    // 1. Marcar pago como verificado
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        statusTransferencia: 'VERIFICADO',
        verificadoPorId: verificador?.id ?? userId,
        verificadoAt: now,
      },
    })

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

    // 5. Caja del cobrador original (a la fecha de verificación)
    const fecha = new Date()
    fecha.setHours(0, 0, 0, 0)

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

  return NextResponse.json({ success: true })
}
