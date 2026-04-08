import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { generateTicketNumber, generateTicketQrData } from '@/lib/ticket-generator'
import { createAuditLog } from '@/lib/audit'
import { calcScoreEventType, calcDiasDiferencia, getScoreChange, aplicarCambioScore } from '@/lib/score-calculator'

const cashBreakdownSchema = z.object({
  denominacion: z.number().int().positive(),
  cantidad: z.number().int().positive(),
  subtotal: z.number().positive(),
})

const createPaymentSchema = z.object({
  scheduleId: z.string().uuid(),
  metodoPago: z.enum(['CASH', 'CARD', 'TRANSFER']),
  monto: z.number().positive(),
  cambioEntregado: z.number().min(0).default(0),
  notas: z.string().optional(),
  cashBreakdown: z.array(cashBreakdownSchema).optional().default([]),
  // Transferencia
  cuentaDestinoId: z.string().uuid().optional(),
  idTransferencia: z.string().optional(),
})

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { companyId } = session.user
  const metodo = req.nextUrl.searchParams.get('metodo')
  const status = req.nextUrl.searchParams.get('status')

  const payments = await prisma.payment.findMany({
    where: {
      loan: { companyId: companyId! },
      ...(metodo ? { metodoPago: metodo as 'CASH' | 'CARD' | 'TRANSFER' } : {}),
      ...(status && metodo === 'TRANSFER' ? { statusTransferencia: status } : {}),
    },
    orderBy: { fechaHora: 'desc' },
    take: 100,
    select: {
      id: true,
      monto: true,
      metodoPago: true,
      fechaHora: true,
      cambioEntregado: true,
      notas: true,
      idTransferencia: true,
      statusTransferencia: true,
      cobrador: { select: { nombre: true } },
      client: { select: { nombreCompleto: true } },
      loan: { select: { tipo: true } },
      cuentaDestino: { select: { banco: true, titular: true, clabe: true } },
    },
  })

  return NextResponse.json({ data: payments })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { companyId, branchId, id: userId } = session.user

  const cobrador = await prisma.user.findFirst({
    where: { companyId: companyId!, email: session.user.email! },
  })
  if (!cobrador) return NextResponse.json({ error: 'Cobrador no encontrado' }, { status: 403 })

  const body = await req.json()
  const parsed = createPaymentSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const data = parsed.data

  // Obtener el schedule con el préstamo
  const schedule = await prisma.paymentSchedule.findFirst({
    where: {
      id: data.scheduleId,
      loan: { companyId: companyId!, cobradorId: cobrador.id },
      estado: { in: ['PENDING', 'OVERDUE', 'PARTIAL'] },
    },
    include: {
      loan: {
        include: {
          client: true,
          branch: { select: { nombre: true } },
          cobrador: { select: { nombre: true } },
          company: { select: { nombre: true } },
          schedule: { where: { estado: { in: ['PENDING', 'OVERDUE', 'PARTIAL'] } } },
        },
      },
    },
  })

  if (!schedule) {
    return NextResponse.json({ error: 'Cobro no encontrado o ya procesado' }, { status: 404 })
  }

  const loan = schedule.loan
  const targetBranchId = branchId ?? loan.branchId

  // Determinar prefijo de sucursal para el ticket
  const branchName = loan.branch.nombre
  const branchPrefix = branchName
    .split(' ')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 4)

  const result = await prisma.$transaction(async (tx) => {
    const now = new Date()

    // 1. Crear pago
    const payment = await tx.payment.create({
      data: {
        loanId: loan.id,
        scheduleId: schedule.id,
        cobradorId: cobrador.id,
        clientId: loan.clientId,
        monto: data.monto,
        metodoPago: data.metodoPago,
        cambioEntregado: data.cambioEntregado,
        notas: data.notas ?? null,
        fechaHora: now,
        ...(data.metodoPago === 'TRANSFER' ? {
          cuentaDestinoId: data.cuentaDestinoId ?? null,
          idTransferencia: data.idTransferencia ?? null,
          statusTransferencia: 'PENDIENTE',
        } : {}),
      },
    })

    // 2. Crear desglose de efectivo
    if (data.metodoPago === 'CASH' && data.cashBreakdown.length > 0) {
      await tx.cashBreakdown.createMany({
        data: data.cashBreakdown.map((d) => ({
          paymentId: payment.id,
          denominacion: d.denominacion,
          cantidad: d.cantidad,
          subtotal: d.subtotal,
        })),
      })
    }

    // 3. Actualizar estado del schedule
    const nuevoEstado = data.monto >= Number(schedule.montoEsperado) ? 'PAID' : 'PARTIAL'
    await tx.paymentSchedule.update({
      where: { id: schedule.id },
      data: {
        montoPagado: { increment: data.monto },
        estado: nuevoEstado,
        pagadoAt: nuevoEstado === 'PAID' ? now : null,
      },
    })

    // 4. ¿Todos los schedules pagados? → liquidar préstamo
    const pendingSchedules = loan.schedule.filter((s) => s.id !== schedule.id)
    if (pendingSchedules.length === 0 && nuevoEstado === 'PAID') {
      await tx.loan.update({
        where: { id: loan.id },
        data: { estado: 'LIQUIDATED' },
      })
    }

    // 5. Score: calcular evento
    const diasDiff = calcDiasDiferencia(schedule.fechaVencimiento, now)
    const tipoEvento = calcScoreEventType(diasDiff)
    const cambioScore = getScoreChange(tipoEvento)
    const nuevoScore = aplicarCambioScore(loan.client.score, cambioScore)

    await tx.scoreEvent.create({
      data: {
        clientId: loan.clientId,
        loanId: loan.id,
        paymentId: payment.id,
        registradoPorId: cobrador.id,
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

    // 6. Actualizar caja del cobrador
    const fecha = new Date()
    fecha.setHours(0, 0, 0, 0)

    await tx.cashRegister.upsert({
      where: { cobradorId_fecha: { cobradorId: cobrador.id, fecha } },
      create: {
        cobradorId: cobrador.id,
        branchId: targetBranchId!,
        fecha,
        cobradoEfectivo: data.metodoPago === 'CASH' ? data.monto : 0,
        cobradoTarjeta: data.metodoPago === 'CARD' ? data.monto : 0,
        cobradoTransferencia: data.metodoPago === 'TRANSFER' ? data.monto : 0,
        cambioEntregado: data.cambioEntregado,
      },
      update: {
        cobradoEfectivo: data.metodoPago === 'CASH' ? { increment: data.monto } : undefined,
        cobradoTarjeta: data.metodoPago === 'CARD' ? { increment: data.monto } : undefined,
        cobradoTransferencia: data.metodoPago === 'TRANSFER' ? { increment: data.monto } : undefined,
        cambioEntregado: { increment: data.cambioEntregado },
      },
    })

    // 7. Generar ticket
    const year = now.getFullYear()
    const numeroTicket = await generateTicketNumber(branchPrefix, year)
    const qrCode = generateTicketQrData(numeroTicket)

    const ticket = await tx.ticket.create({
      data: {
        paymentId: payment.id,
        companyId: companyId!,
        branchId: targetBranchId!,
        numeroTicket,
        impresoPorId: cobrador.id,
        qrCode,
      },
    })

    return {
      payment,
      ticket,
      companyName: loan.company.nombre,
      branchName: loan.branch.nombre,
      cobradorName: cobrador.nombre,
    }
  })

  createAuditLog({
    userId,
    accion: 'CREATE_PAYMENT',
    tabla: 'Payment',
    registroId: result.payment.id,
    valoresNuevos: {
      scheduleId: data.scheduleId,
      monto: data.monto,
      metodoPago: data.metodoPago,
      ticket: result.ticket.numeroTicket,
    },
  })

  return NextResponse.json({ data: result }, { status: 201 })
}
