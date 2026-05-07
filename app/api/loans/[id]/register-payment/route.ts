import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { createAuditLog } from '@/lib/audit'
import { calcTarifaApertura } from '@/lib/financial-formulas'
import { generateTicketNumber, generateTicketQrData } from '@/lib/ticket-generator'
import { todayMx } from '@/lib/timezone'

const registerPaymentSchema = z.object({
  metodoPago: z.enum(['CASH', 'CARD', 'TRANSFER', 'FINANCIADO']),
  cashBreakdown: z.array(z.object({
    denominacion: z.number(),
    cantidad: z.number(),
    subtotal: z.number(),
  })).optional(),
  cambioEntregado: z.number().optional(),
  cuentaDestinoId: z.string().uuid().optional(),
  idTransferencia: z.string().optional(),
})

/**
 * POST /api/loans/[id]/register-payment
 *
 * Candado 2 del flujo de activación. Registra el Payment de comisión/seguro
 * de apertura. Reemplaza la sección equivalente del endpoint legacy /activate.
 *
 * Reglas:
 *   - El préstamo debe estar en IN_ACTIVATION
 *   - Candado 1 (contrato firmado) debe estar cumplido
 *   - Candado 2 NO debe estar cumplido todavía (no hay Payment vigente)
 *
 * Comportamiento por método:
 *   - CASH/CARD: crea Payment, actualiza CashRegister, genera ticket si CASH
 *   - TRANSFER:  crea Payment con statusTransferencia=PENDIENTE (gerente verifica)
 *   - FINANCIADO: descuenta tarifa del montoReal, NO crea Payment
 *
 * Permisos: SUPER_ADMIN, COORDINADOR/GERENTE_ZONAL del préstamo.
 * (Para verificación de TRANSFER se sigue usando el endpoint legacy /activate.)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { rol, companyId, id: userId, branchId: sessionBranchId, zonaBranchIds } = session.user

  const loan = await prisma.loan.findFirst({
    where: { id: params.id, companyId: companyId! },
    include: { branch: { select: { nombre: true } } },
  })
  if (!loan) {
    return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })
  }

  // Permisos
  let allowed = false
  if (rol === 'SUPER_ADMIN') {
    allowed = true
  } else if (rol === 'COORDINADOR' || rol === 'GERENTE') {
    allowed = loan.cobradorId === userId
  } else if (rol === 'GERENTE_ZONAL') {
    const zoneIds = Array.isArray(zonaBranchIds) ? zonaBranchIds : []
    allowed = zoneIds.includes(loan.branchId) || loan.cobradorId === userId
  }
  if (!allowed) {
    return NextResponse.json({ error: 'Sin permisos para registrar el pago' }, { status: 403 })
  }

  if (loan.estado !== 'IN_ACTIVATION') {
    return NextResponse.json(
      { error: 'El préstamo debe estar en IN_ACTIVATION para registrar el pago' },
      { status: 400 }
    )
  }

  // Candado 1: contrato firmado
  const contractWithSigned = await prisma.contract.findFirst({
    where: {
      companyId: companyId!,
      loanDocumentFirmadoId: { not: null },
      OR: [
        { loanId: loan.id },
        { groupMembers: { some: { loanId: loan.id } } },
      ],
    },
    select: { id: true },
  })
  if (!contractWithSigned) {
    return NextResponse.json(
      { error: 'Primero suba el contrato firmado (candado 1)' },
      { status: 400 }
    )
  }

  // Candado 2: no debe haber Payment vigente
  const paymentVigente = await prisma.payment.count({
    where: {
      loanId: loan.id,
      scheduleId: null,
      canceledAt: null,
      OR: [
        { notas: { contains: 'apertura', mode: 'insensitive' } },
        { notas: { contains: 'seguro',   mode: 'insensitive' } },
        { notas: { contains: 'comisi',   mode: 'insensitive' } },
      ],
    },
  })
  if (paymentVigente > 0) {
    return NextResponse.json(
      { error: 'Ya existe un pago de comisión registrado para este préstamo' },
      { status: 400 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const parsed = registerPaymentSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }
  const data = parsed.data

  const tarifa = calcTarifaApertura(
    loan.tipo as 'SOLIDARIO' | 'INDIVIDUAL' | 'AGIL' | 'FIDUCIARIO',
    Number(loan.capital),
    Number(loan.comision)
  )
  const esFeeSeguro = tarifa.concepto === 'SEGURO'
  const feeMonto = tarifa.monto
  const feeConcepto = esFeeSeguro ? 'Seguro de apertura' : 'Comisión de apertura'

  // ── FINANCIADO ──────────────────────────────────────────────────────────
  if (data.metodoPago === 'FINANCIADO') {
    const nuevoMontoReal = Number(loan.montoReal) - feeMonto
    await prisma.$transaction(async (tx) => {
      await tx.loan.update({
        where: { id: loan.id },
        data: {
          montoReal: nuevoMontoReal,
          ...(esFeeSeguro ? { seguro: feeMonto } : {}),
          seguroMetodoPago: 'CASH',  // por convención, FINANCIADO se asienta como CASH descontado
          seguroPendiente: false,
        },
      })
      // Payment ficticio (monto 0) para que el candado 2 quede registrado de
      // forma consistente con CASH/CARD/TRANSFER. Permite que cancel-payment
      // y cancel-start-activation detecten el avance vía la búsqueda por notas.
      await tx.payment.create({
        data: {
          loanId: loan.id,
          cobradorId: userId,
          clientId: loan.clientId,
          monto: 0,
          metodoPago: 'CASH',
          cambioEntregado: 0,
          notas: `FINANCIADO - apertura registrada (${feeConcepto}: $${feeMonto.toFixed(2)})`,
          fechaHora: new Date(),
        },
      })
    })
    createAuditLog({
      userId,
      accion: 'REGISTER_ACTIVATION_FEE_FINANCED',
      tabla: 'Loan',
      registroId: loan.id,
      valoresNuevos: { feeMonto, feeConcepto, metodoPago: 'FINANCIADO', nuevoMontoReal },
    })
    return NextResponse.json({ ok: true, message: 'Comisión financiada — descontada del monto entregado' })
  }

  // ── TRANSFER ────────────────────────────────────────────────────────────
  if (data.metodoPago === 'TRANSFER') {
    await prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          loanId: loan.id,
          cobradorId: userId,
          clientId: loan.clientId,
          monto: feeMonto,
          metodoPago: 'TRANSFER',
          cambioEntregado: 0,
          notas: feeConcepto,
          fechaHora: new Date(),
          cuentaDestinoId: data.cuentaDestinoId ?? null,
          idTransferencia: data.idTransferencia ?? null,
          statusTransferencia: 'PENDIENTE',
        },
      })
      await tx.loan.update({
        where: { id: loan.id },
        data: {
          ...(esFeeSeguro ? { seguro: feeMonto } : {}),
          seguroMetodoPago: 'TRANSFER',
          seguroPendiente: true,
        },
      })
    })
    createAuditLog({
      userId,
      accion: 'REGISTER_ACTIVATION_FEE_TRANSFER',
      tabla: 'Loan',
      registroId: loan.id,
      valoresNuevos: { feeMonto, feeConcepto, metodoPago: 'TRANSFER', seguroPendiente: true },
    })
    return NextResponse.json({
      ok: true,
      seguroPendiente: true,
      message: `${feeConcepto} registrado por transferencia. Pendiente de verificación por el gerente.`,
    })
  }

  // ── CASH / CARD ─────────────────────────────────────────────────────────
  // En este punto, FINANCIADO y TRANSFER ya retornaron arriba — sólo queda
  // CASH o CARD. Estrechamos el tipo a `PaymentMethod` aceptado por Prisma.
  const metodoCashCard = data.metodoPago as 'CASH' | 'CARD'

  const branchPrefix = loan.branch.nombre
    .split(' ')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 4)

  const result = await prisma.$transaction(async (tx) => {
    const now = new Date()

    const payment = await tx.payment.create({
      data: {
        loanId: loan.id,
        cobradorId: userId,
        clientId: loan.clientId,
        monto: feeMonto,
        metodoPago: metodoCashCard,
        cambioEntregado: data.cambioEntregado ?? 0,
        notas: feeConcepto,
        fechaHora: now,
      },
    })

    if (metodoCashCard === 'CASH' && data.cashBreakdown && data.cashBreakdown.length > 0) {
      await tx.cashBreakdown.createMany({
        data: data.cashBreakdown.map((d) => ({
          paymentId: payment.id,
          denominacion: d.denominacion,
          cantidad: d.cantidad,
          subtotal: d.subtotal,
        })),
      })
    }

    await tx.loan.update({
      where: { id: loan.id },
      data: {
        ...(esFeeSeguro ? { seguro: feeMonto } : {}),
        seguroMetodoPago: metodoCashCard,
        seguroPendiente: false,
      },
    })

    // Caja del día
    const fechaCaja = todayMx()
    const targetBranchId = sessionBranchId ?? loan.branchId
    await tx.cashRegister.upsert({
      where: { cobradorId_fecha: { cobradorId: userId, fecha: fechaCaja } },
      create: {
        cobradorId: userId,
        branchId: targetBranchId!,
        fecha: fechaCaja,
        cobradoEfectivo: metodoCashCard === 'CASH' ? feeMonto : 0,
        cobradoTarjeta: metodoCashCard === 'CARD' ? feeMonto : 0,
        cobradoTransferencia: 0,
        cambioEntregado: data.cambioEntregado ?? 0,
      },
      update: {
        cobradoEfectivo: metodoCashCard === 'CASH' ? { increment: feeMonto } : undefined,
        cobradoTarjeta:  metodoCashCard === 'CARD' ? { increment: feeMonto } : undefined,
        cambioEntregado: data.cambioEntregado ? { increment: data.cambioEntregado } : undefined,
      },
    })

    // Ticket sólo para CASH (CARD imprime la terminal)
    let ticket = null
    if (metodoCashCard === 'CASH' && feeMonto > 0) {
      const year = now.getFullYear()
      const numeroTicket = await generateTicketNumber(branchPrefix, year)
      const qrCode = generateTicketQrData(numeroTicket)
      ticket = await tx.ticket.create({
        data: {
          paymentId: payment.id,
          companyId: companyId!,
          branchId: targetBranchId!,
          numeroTicket,
          impresoPorId: userId,
          qrCode,
        },
      })
    }

    return { payment, ticket }
  })

  createAuditLog({
    userId,
    accion: 'REGISTER_ACTIVATION_FEE',
    tabla: 'Loan',
    registroId: loan.id,
    valoresNuevos: {
      feeMonto,
      feeConcepto,
      metodoPago: metodoCashCard,
      ticketNumero: result.ticket?.numeroTicket ?? null,
    },
  })

  return NextResponse.json({
    ok: true,
    message: `${feeConcepto} registrado`,
    ticket: result.ticket
      ? { id: result.ticket.id, numeroTicket: result.ticket.numeroTicket }
      : null,
  })
}
