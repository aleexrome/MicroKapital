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
  if (!esOpAdmin) {
    return NextResponse.json({ error: 'No autorizado para aplicar pagos' }, { status: 403 })
  }

  const { companyId, id: userId } = session.user

  const schedule = await prisma.paymentSchedule.findFirst({
    where: {
      id: params.scheduleId,
      loanId: params.id,
      loan: { companyId: companyId! },
    },
    include: {
      loan: { select: { id: true, estado: true } },
    },
  })

  if (!schedule) {
    return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })
  }
  if (schedule.estado === 'PAID' || schedule.estado === 'ADVANCE') {
    return NextResponse.json({ error: 'Este pago ya está marcado como pagado' }, { status: 400 })
  }

  const now = new Date()

  const snapshotAntes = {
    estado: schedule.estado,
    montoPagado: schedule.montoPagado,
    pagadoAt: schedule.pagadoAt,
    loanEstado: schedule.loan.estado,
  }

  await prisma.$transaction(async (tx) => {
    // 1. Marcar el pago como PAID con el monto esperado completo
    await tx.paymentSchedule.update({
      where: { id: schedule.id },
      data: {
        estado:      'PAID',
        montoPagado: schedule.montoEsperado,
        pagadoAt:    now,
      },
    })

    // 2. Si todos los pagos del crédito quedan PAID → liquidar el crédito
    const pendientes = await tx.paymentSchedule.count({
      where: {
        loanId: params.id,
        id:     { not: schedule.id },
        estado: { not: 'PAID' },
      },
    })

    if (pendientes === 0 && schedule.loan.estado === 'ACTIVE') {
      await tx.loan.update({
        where: { id: schedule.loan.id },
        data:  { estado: 'LIQUIDATED' },
      })
    }
  })

  createAuditLog({
    userId,
    accion: 'DG_APPLY_PAYMENT',
    tabla:  'PaymentSchedule',
    registroId: schedule.id,
    valoresAnteriores: snapshotAntes,
    valoresNuevos: {
      estado:      'PAID',
      montoPagado: schedule.montoEsperado,
      pagadoAt:    now,
    },
  })

  return NextResponse.json({ message: 'Pago aplicado correctamente' })
}
