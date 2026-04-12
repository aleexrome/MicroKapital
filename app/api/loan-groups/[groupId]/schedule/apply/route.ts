import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { z } from 'zod'

const schema = z.object({ numeroPago: z.number().int().positive() })

export async function POST(
  req: NextRequest,
  { params }: { params: { groupId: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const esOpAdmin = session.user.rol === 'DIRECTOR_GENERAL' || session.user.rol === 'SUPER_ADMIN'
  if (!esOpAdmin) {
    return NextResponse.json({ error: 'No autorizado para aplicar pagos grupales' }, { status: 403 })
  }

  const { companyId, id: userId } = session.user

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const { numeroPago } = parsed.data

  const schedules = await prisma.paymentSchedule.findMany({
    where: {
      numeroPago,
      estado: { notIn: ['PAID', 'ADVANCE'] },
      loan: { loanGroupId: params.groupId, companyId: companyId! },
    },
    include: {
      loan: { select: { id: true, estado: true } },
    },
  })

  if (schedules.length === 0) {
    return NextResponse.json(
      { error: 'No hay pagos pendientes para este número de pago en el grupo' },
      { status: 404 }
    )
  }

  const now = new Date()

  await prisma.$transaction(async (tx) => {
    for (const schedule of schedules) {
      await tx.paymentSchedule.update({
        where: { id: schedule.id },
        data: {
          estado:      'PAID',
          montoPagado: schedule.montoEsperado,
          pagadoAt:    now,
        },
      })

      const pendientes = await tx.paymentSchedule.count({
        where: {
          loanId: schedule.loanId,
          id:     { not: schedule.id },
          estado: { notIn: ['PAID', 'ADVANCE'] },
        },
      })

      if (pendientes === 0 && schedule.loan.estado === 'ACTIVE') {
        await tx.loan.update({
          where: { id: schedule.loan.id },
          data:  { estado: 'LIQUIDATED' },
        })
      }
    }
  })

  createAuditLog({
    userId,
    accion: 'DG_APPLY_PAYMENT_GRUPO',
    tabla: 'LoanGroup',
    registroId: params.groupId,
    valoresNuevos: { numeroPago, schedulesAplicados: schedules.length },
  })

  return NextResponse.json({
    message: `Pago ${numeroPago} aplicado a ${schedules.length} integrante(s)`,
    aplicados: schedules.length,
  })
}
