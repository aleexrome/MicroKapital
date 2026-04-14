import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string; scheduleId: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const esOpAdmin = session.user.rol === 'DIRECTOR_GENERAL' || session.user.rol === 'SUPER_ADMIN'
  const tienePermiso = esOpAdmin || session.user.permisoAplicarPagos === true
  if (!tienePermiso) {
    return NextResponse.json({ error: 'No autorizado para deshacer pagos' }, { status: 403 })
  }

  const { companyId, id: userId, branchId: userBranchId } = session.user

  const loanFilter = esOpAdmin
    ? { companyId: companyId! }
    : { companyId: companyId!, branchId: userBranchId! }

  // Cargar el schedule con el préstamo y sus pagos
  const schedule = await prisma.paymentSchedule.findFirst({
    where: {
      id: params.scheduleId,
      loanId: params.id,
      loan: loanFilter,
    },
    include: {
      loan: { select: { id: true, estado: true } },
      payments: {
        select: {
          id: true,
          monto: true,
          metodoPago: true,
          fechaHora: true,
          cobradorId: true,
        },
      },
    },
  })

  if (!schedule) {
    return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })
  }
  if (schedule.estado !== 'PAID') {
    return NextResponse.json({ error: 'Este pago no está marcado como PAID' }, { status: 400 })
  }

  const snapshotAntes = {
    estado: schedule.estado,
    montoPagado: schedule.montoPagado,
    pagadoAt: schedule.pagadoAt,
    loanEstado: schedule.loan.estado,
    pagosEliminados: schedule.payments.length,
  }

  await prisma.$transaction(async (tx) => {
    // 1. Revertir cada Payment asociado y ajustar CashRegister
    for (const pago of schedule.payments) {
      const fechaCaja = new Date(pago.fechaHora)
      fechaCaja.setHours(0, 0, 0, 0)

      // Reducir el total de la caja del cobrador ese día
      await tx.cashRegister.updateMany({
        where: { cobradorId: pago.cobradorId, fecha: fechaCaja },
        data: {
          cobradoEfectivo:      pago.metodoPago === 'CASH'     ? { decrement: Number(pago.monto) } : undefined,
          cobradoTarjeta:       pago.metodoPago === 'CARD'     ? { decrement: Number(pago.monto) } : undefined,
          cobradoTransferencia: pago.metodoPago === 'TRANSFER' ? { decrement: Number(pago.monto) } : undefined,
        },
      })

      // Eliminar el registro del pago
      await tx.payment.delete({ where: { id: pago.id } })
    }

    // 2. Revertir el PaymentSchedule a PENDING
    await tx.paymentSchedule.update({
      where: { id: schedule.id },
      data: {
        estado:      'PENDING',
        montoPagado: 0,
        pagadoAt:    null,
      },
    })

    // 3. Si el préstamo estaba LIQUIDATED, regresarlo a ACTIVE
    //    (hay al menos este schedule que ya no está pagado)
    if (schedule.loan.estado === 'LIQUIDATED') {
      await tx.loan.update({
        where: { id: schedule.loan.id },
        data: { estado: 'ACTIVE' },
      })
    }
  })

  createAuditLog({
    userId,
    accion: 'SUPER_ADMIN_UNDO_PAYMENT',
    tabla: 'PaymentSchedule',
    registroId: schedule.id,
    valoresAnteriores: snapshotAntes,
    valoresNuevos: {
      estado: 'PENDING',
      montoPagado: 0,
      pagadoAt: null,
      loanEstado: schedule.loan.estado === 'LIQUIDATED' ? 'ACTIVE' : schedule.loan.estado,
    },
  })

  return NextResponse.json({ message: 'Pago revertido correctamente' })
}
