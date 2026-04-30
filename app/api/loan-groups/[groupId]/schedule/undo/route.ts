import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { startOfDayMx } from '@/lib/timezone'
import { z } from 'zod'

const schema = z.object({ numeroPago: z.number().int().positive() })

export async function POST(
  req: NextRequest,
  { params }: { params: { groupId: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const esOpAdmin = session.user.rol === 'DIRECTOR_GENERAL' || session.user.rol === 'DIRECTOR_COMERCIAL' || session.user.rol === 'SUPER_ADMIN'
  const tienePermiso = esOpAdmin || session.user.permisoAplicarPagos === true
  if (!tienePermiso) {
    return NextResponse.json({ error: 'No autorizado para deshacer pagos grupales' }, { status: 403 })
  }

  const { companyId, id: userId, branchId: userBranchId } = session.user

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const { numeroPago } = parsed.data

  const loanFilter = esOpAdmin
    ? { loanGroupId: params.groupId, companyId: companyId! }
    : { loanGroupId: params.groupId, companyId: companyId!, branchId: userBranchId! }

  const schedules = await prisma.paymentSchedule.findMany({
    where: {
      numeroPago,
      estado: 'PAID',
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

  if (schedules.length === 0) {
    return NextResponse.json(
      { error: 'No hay pagos realizados para este número de pago en el grupo' },
      { status: 404 }
    )
  }

  await prisma.$transaction(async (tx) => {
    for (const schedule of schedules) {
      for (const pago of schedule.payments) {
        // Día CDMX en que se hizo el Payment (caja del día correspondiente)
        const fechaCaja = startOfDayMx(new Date(pago.fechaHora))

        await tx.cashRegister.updateMany({
          where: { cobradorId: pago.cobradorId, fecha: fechaCaja },
          data: {
            cobradoEfectivo:      pago.metodoPago === 'CASH'     ? { decrement: Number(pago.monto) } : undefined,
            cobradoTarjeta:       pago.metodoPago === 'CARD'     ? { decrement: Number(pago.monto) } : undefined,
            cobradoTransferencia: pago.metodoPago === 'TRANSFER' ? { decrement: Number(pago.monto) } : undefined,
          },
        })

        await tx.payment.delete({ where: { id: pago.id } })
      }

      await tx.paymentSchedule.update({
        where: { id: schedule.id },
        data: {
          estado:      'PENDING',
          montoPagado: 0,
          pagadoAt:    null,
        },
      })

      if (schedule.loan.estado === 'LIQUIDATED') {
        await tx.loan.update({
          where: { id: schedule.loan.id },
          data:  { estado: 'ACTIVE' },
        })
      }
    }
  })

  createAuditLog({
    userId,
    accion: 'SUPER_ADMIN_UNDO_PAYMENT_GRUPO',
    tabla: 'LoanGroup',
    registroId: params.groupId,
    valoresNuevos: { numeroPago, schedulesRevertidos: schedules.length },
  })

  return NextResponse.json({
    message: `Pago ${numeroPago} revertido para ${schedules.length} integrante(s)`,
    revertidos: schedules.length,
  })
}
