import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { todayMx } from '@/lib/timezone'
import { calcTarifaApertura } from '@/lib/financial-formulas'

/**
 * POST /api/loans/[id]/cancel-payment
 *
 * Botón "Atrás" del candado 2. Soft-cancela el Payment de comisión/seguro
 * de apertura y revierte los efectos colaterales (ticket anulado,
 * CashRegister decrementado, seguro... limpio).
 *
 * Reglas:
 *   - Préstamo en IN_ACTIVATION
 *   - Candado 3 NO cumplido (no se puede cancelar si la foto ya está subida —
 *     en ese punto el préstamo ya está ACTIVE de hecho)
 *   - Hay exactamente un Payment de comisión vigente (canceledAt IS NULL)
 *
 * Permisos: SUPER_ADMIN, COORDINADOR/GERENTE_ZONAL del préstamo.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { rol, companyId, id: userId, zonaBranchIds } = session.user

  const loan = await prisma.loan.findFirst({
    where: { id: params.id, companyId: companyId! },
    select: {
      id: true, estado: true, cobradorId: true, branchId: true,
      desembolsoFotoUrl: true, montoReal: true,
      seguroMetodoPago: true, seguro: true,
      tipo: true, capital: true, comision: true,
    },
  })
  if (!loan) {
    return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })
  }

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
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  if (loan.estado !== 'IN_ACTIVATION') {
    return NextResponse.json(
      { error: 'Solo se puede cancelar el pago durante la activación' },
      { status: 400 }
    )
  }

  if (loan.desembolsoFotoUrl) {
    return NextResponse.json(
      { error: 'No se puede cancelar el pago: la foto de desembolso ya fue subida' },
      { status: 400 }
    )
  }

  const payment = await prisma.payment.findFirst({
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
    include: { tickets: true },
    orderBy: { fechaHora: 'desc' },
  })

  if (!payment) {
    return NextResponse.json(
      { error: 'No hay pago de comisión vigente para cancelar' },
      { status: 400 }
    )
  }

  const ticket = payment.tickets[0] ?? null  // paymentId es @unique → 0 o 1 ticket

  const now = new Date()
  const fechaCaja = todayMx()

  await prisma.$transaction(async (tx) => {
    // Soft-cancel del Payment
    await tx.payment.update({
      where: { id: payment.id },
      data: { canceledAt: now },
    })

    // Anular ticket si lo hay (para que el ticket no se imprima/use)
    if (ticket) {
      await tx.ticket.update({
        where: { id: ticket.id },
        data: {
          anulado: true,
          razonAnulacion: 'Cancelación de pago de comisión durante activación',
        },
      })
    }

    // Revertir CashRegister sólo si fue CASH/CARD (TRANSFER no movió caja del cobrador,
    // y FINANCIADO no crea Payment, así que no debería entrar aquí).
    if (payment.metodoPago === 'CASH' || payment.metodoPago === 'CARD') {
      const cobro = Number(payment.monto)
      const cambio = Number(payment.cambioEntregado)
      // Buscar la fila de caja del cobrador en la fecha en que se hizo el cobro.
      // (Si el pago se hizo otro día y la caja ya cerró, se decrementa de la actual —
      // imperfecto pero suficiente; auditoría queda en el AuditLog.)
      const reg = await tx.cashRegister.findUnique({
        where: { cobradorId_fecha: { cobradorId: payment.cobradorId, fecha: fechaCaja } },
      })
      if (reg) {
        await tx.cashRegister.update({
          where: { cobradorId_fecha: { cobradorId: payment.cobradorId, fecha: fechaCaja } },
          data: {
            cobradoEfectivo: payment.metodoPago === 'CASH' ? { decrement: cobro } : undefined,
            cobradoTarjeta:  payment.metodoPago === 'CARD' ? { decrement: cobro } : undefined,
            cambioEntregado: cambio > 0 ? { decrement: cambio } : undefined,
          },
        })
      }
    }

    // Si el Payment era el ficticio de FINANCIADO, restaurar el montoReal:
    // register-payment lo había decrementado por la tarifa de apertura.
    const esFinanciado = (payment.notas ?? '').toUpperCase().includes('FINANCIADO')
    const montoRealRestoreData = esFinanciado
      ? (() => {
          const tarifa = calcTarifaApertura(
            loan.tipo as 'SOLIDARIO' | 'INDIVIDUAL' | 'AGIL' | 'FIDUCIARIO',
            Number(loan.capital),
            Number(loan.comision)
          )
          return { montoReal: Number(loan.montoReal) + tarifa.monto }
        })()
      : {}

    // Limpiar seguroMetodoPago / seguroPendiente / seguro en el Loan
    await tx.loan.update({
      where: { id: loan.id },
      data: {
        seguro: null,
        seguroMetodoPago: null,
        seguroPendiente: false,
        ...montoRealRestoreData,
      },
    })
  })

  createAuditLog({
    userId,
    accion: 'CANCEL_ACTIVATION_PAYMENT',
    tabla: 'Payment',
    registroId: payment.id,
    valoresNuevos: {
      loanId: loan.id,
      monto: Number(payment.monto),
      metodoPago: payment.metodoPago,
      ticketAnuladoId: ticket?.id ?? null,
    },
  })

  return NextResponse.json({ ok: true })
}
