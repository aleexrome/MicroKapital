import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { createAuditLog } from '@/lib/audit'
import { generateTicketNumber, generateTicketQrData } from '@/lib/ticket-generator'
import { todayMx } from '@/lib/timezone'
import { opcionesMora, opcionParaTipo, labelMora } from '@/lib/moras'

const cashBreakdownSchema = z.object({
  denominacion: z.number().int().positive(),
  cantidad: z.number().int().positive(),
  subtotal: z.number().positive(),
})

const schema = z.object({
  tipo: z.enum(['MULTA', 'MORA']),
  metodoPago: z.enum(['CASH', 'CARD', 'TRANSFER']),
  cambioEntregado: z.number().min(0).default(0),
  cashBreakdown: z.array(cashBreakdownSchema).optional().default([]),
  cuentaDestinoId: z.string().uuid().optional(),
  idTransferencia: z.string().optional(),
})

/**
 * POST /api/loans/[id]/schedule/[scheduleId]/mora/cobrar
 *
 * Cobra multa o mora asociada al schedule como movimiento independiente
 * del pago principal. El coordinador escoge tipo (MULTA $200 o MORA $500)
 * cuando ambas opciones aplican; solo una puede cobrarse por schedule.
 * Genera:
 *   - Payment (scheduleId=null) con el monto elegido.
 *   - Ticket separado (numeración de sucursal).
 *   - MoraCobro cobrada=true (crea o actualiza si existía pendiente,
 *     incluso cambiando el tipo).
 *   - CashRegister del cobrador +monto (CASH/CARD directo, TRANSFER queda
 *     pendiente de verificación por GZ como un pago normal).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; scheduleId: string } },
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, branchId: userBranchId, id: userId, zonaBranchIds } = session.user

  const cobrador = await prisma.user.findFirst({
    where: { id: userId, companyId: companyId! },
    select: { id: true, nombre: true, permisoAplicarPagos: true },
  })
  if (!cobrador) return NextResponse.json({ error: 'Cobrador no encontrado' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const data = parsed.data

  const schedule = await prisma.paymentSchedule.findFirst({
    where: {
      id: params.scheduleId,
      loanId: params.id,
      loan: { companyId: companyId! },
    },
    include: {
      loan: {
        include: {
          client: { select: { id: true, nombreCompleto: true } },
          branch: { select: { id: true, nombre: true } },
        },
      },
    },
  })
  if (!schedule) return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })

  const esOpAdmin = rol === 'DIRECTOR_GENERAL' || rol === 'SUPER_ADMIN' || rol === 'DIRECTOR_COMERCIAL'
  const esGerente = rol === 'GERENTE' || rol === 'GERENTE_ZONAL'
  const esCoordinador = rol === 'COORDINADOR' || rol === 'COBRADOR'
  let autorizado = false
  if (esOpAdmin) autorizado = true
  else if (esCoordinador) autorizado = schedule.loan.cobradorId === userId
  else if (esGerente) {
    const zonas = Array.isArray(zonaBranchIds) ? zonaBranchIds
      : userBranchId ? [userBranchId] : []
    autorizado = zonas.length === 0 || zonas.includes(schedule.loan.branchId)
  } else if (cobrador.permisoAplicarPagos) {
    autorizado = !!userBranchId && schedule.loan.branchId === userBranchId
  }
  if (!autorizado) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const now = new Date()
  const opciones = opcionesMora(schedule.fechaVencimiento, now)
  const escogida = opcionParaTipo(opciones, data.tipo)
  if (!escogida) {
    return NextResponse.json(
      { error: `${labelMora(data.tipo)} no aplica para este pago en este momento` },
      { status: 400 },
    )
  }

  const existente = await prisma.moraCobro.findUnique({
    where: { scheduleId: schedule.id },
    select: { id: true, cobrada: true },
  })
  if (existente?.cobrada) {
    return NextResponse.json(
      { error: 'Este pago ya tiene multa o mora cobrada' },
      { status: 400 },
    )
  }

  const branchName = schedule.loan.branch.nombre
  const branchPrefix = branchName
    .split(' ')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 4)
  const targetBranchId = schedule.loan.branchId
  const fecha = todayMx()
  const esTransferencia = data.metodoPago === 'TRANSFER'

  const result = await prisma.$transaction(async (tx) => {
    const paymentMora = await tx.payment.create({
      data: {
        loanId: schedule.loan.id,
        scheduleId: null,
        cobradorId: cobrador.id,
        clientId: schedule.loan.clientId,
        monto: escogida.monto,
        metodoPago: data.metodoPago,
        cambioEntregado: data.cambioEntregado,
        notas: `${labelMora(escogida.tipo)} por atraso — pago #${schedule.numeroPago}`,
        fechaHora: now,
        ...(esTransferencia
          ? {
              cuentaDestinoId: data.cuentaDestinoId ?? null,
              idTransferencia: data.idTransferencia ?? null,
              statusTransferencia: 'PENDIENTE',
            }
          : {}),
      },
    })

    if (data.metodoPago === 'CASH' && data.cashBreakdown.length > 0) {
      await tx.cashBreakdown.createMany({
        data: data.cashBreakdown.map((d) => ({
          paymentId: paymentMora.id,
          denominacion: d.denominacion,
          cantidad: d.cantidad,
          subtotal: d.subtotal,
        })),
      })
    }

    let moraCobroId: string
    if (existente) {
      const updated = await tx.moraCobro.update({
        where: { id: existente.id },
        data: {
          tipo: escogida.tipo,
          monto: escogida.monto,
          cobrada: true,
          cobradaAt: now,
          paymentCobroId: paymentMora.id,
          cobradorId: cobrador.id,
        },
      })
      moraCobroId = updated.id
    } else {
      const created = await tx.moraCobro.create({
        data: {
          companyId: companyId!,
          branchId: targetBranchId,
          loanId: schedule.loan.id,
          scheduleId: schedule.id,
          clientId: schedule.loan.clientId,
          cobradorId: cobrador.id,
          tipo: escogida.tipo,
          monto: escogida.monto,
          paymentOrigenId: null,
          paymentCobroId: paymentMora.id,
          cobrada: true,
          cobradaAt: now,
        },
      })
      moraCobroId = created.id
    }

    await tx.cashRegister.upsert({
      where: { cobradorId_fecha: { cobradorId: cobrador.id, fecha } },
      create: {
        cobradorId: cobrador.id,
        branchId: targetBranchId,
        fecha,
        cobradoEfectivo: data.metodoPago === 'CASH' ? escogida.monto : 0,
        cobradoTarjeta: data.metodoPago === 'CARD' ? escogida.monto : 0,
        cobradoTransferencia: data.metodoPago === 'TRANSFER' ? escogida.monto : 0,
        cambioEntregado: data.cambioEntregado,
      },
      update: {
        cobradoEfectivo: data.metodoPago === 'CASH' ? { increment: escogida.monto } : undefined,
        cobradoTarjeta: data.metodoPago === 'CARD' ? { increment: escogida.monto } : undefined,
        cobradoTransferencia: data.metodoPago === 'TRANSFER' ? { increment: escogida.monto } : undefined,
        cambioEntregado: data.cambioEntregado > 0 ? { increment: data.cambioEntregado } : undefined,
      },
    })

    const year = now.getFullYear()
    const numeroTicket = await generateTicketNumber(branchPrefix, year)
    const qrCode = generateTicketQrData(numeroTicket)
    const ticket = await tx.ticket.create({
      data: {
        paymentId: paymentMora.id,
        companyId: companyId!,
        branchId: targetBranchId,
        numeroTicket,
        impresoPorId: cobrador.id,
        qrCode,
      },
    })

    return { payment: paymentMora, ticket, moraCobroId }
  })

  createAuditLog({
    userId,
    accion: 'COBRAR_MORA',
    tabla: 'MoraCobro',
    registroId: result.moraCobroId,
    valoresNuevos: {
      scheduleId: schedule.id,
      tipo: escogida.tipo,
      monto: escogida.monto,
      metodoPago: data.metodoPago,
      paymentId: result.payment.id,
      ticket: result.ticket.numeroTicket,
    },
  })

  return NextResponse.json(
    {
      data: {
        payment: result.payment,
        ticket: result.ticket,
        mora: { tipo: escogida.tipo, monto: escogida.monto },
        clienteNombre: schedule.loan.client.nombreCompleto,
        branchName,
        cobradorName: cobrador.nombre,
      },
    },
    { status: 201 },
  )
}
