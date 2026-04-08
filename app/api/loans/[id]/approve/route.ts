import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { z } from 'zod'

const approveSchema = z.object({
  notas: z.string().optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, id: userId } = session.user

  if (rol !== 'DIRECTOR_GENERAL' && rol !== 'SUPER_ADMIN') {
    return NextResponse.json(
      { error: 'Sin permisos — solo el Director General puede aprobar créditos' },
      { status: 403 }
    )
  }

  const loan = await prisma.loan.findFirst({
    where: { id: params.id, companyId: companyId! },
    include: {
      loanOriginal: {
        include: {
          schedule: {
            where: { estado: { in: ['PENDING', 'OVERDUE', 'PARTIAL'] } },
          },
        },
      },
    },
  })

  if (!loan) return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })
  if (loan.estado !== 'PENDING_APPROVAL') {
    return NextResponse.json({ error: 'El préstamo no está pendiente de aprobación' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = approveSchema.safeParse(body)
  const notas = parsed.success ? parsed.data.notas : undefined

  await prisma.$transaction(async (tx) => {
    // 1. Aprobar el nuevo crédito
    await tx.loan.update({
      where: { id: loan.id },
      data: {
        estado: 'APPROVED',
        aprobadoPorId: userId,
        aprobadoAt: new Date(),
      },
    })

    await tx.loanApproval.updateMany({
      where: { loanId: loan.id, estado: 'PENDING' },
      data: {
        estado: 'APPROVED',
        revisadoPorId: userId,
        revisadoAt: new Date(),
        notas: notas ?? null,
      },
    })

    // 2. Si es una renovación anticipada, liquidar el crédito anterior en este momento
    if (loan.loanOriginalId && loan.loanOriginal) {
      const schedulesPendientes = loan.loanOriginal.schedule

      // Marcar los pagos pendientes restantes como PAID (financiados por la empresa)
      if (schedulesPendientes.length > 0) {
        await tx.paymentSchedule.updateMany({
          where: {
            id: { in: schedulesPendientes.map((s) => s.id) },
          },
          data: {
            estado: 'PAID',
            pagadoAt: new Date(),
            montoPagado: schedulesPendientes[0].montoEsperado, // todos tienen el mismo monto
          },
        })
      }

      // Liquidar el crédito anterior
      await tx.loan.update({
        where: { id: loan.loanOriginalId },
        data: { estado: 'LIQUIDATED' },
      })
    }
  })

  const esRenovacion = !!loan.loanOriginalId

  createAuditLog({
    userId,
    accion: 'APPROVE_LOAN',
    tabla: 'Loan',
    registroId: loan.id,
    valoresNuevos: {
      estado: 'APPROVED',
      aprobadoPorId: userId,
      ...(esRenovacion ? { loanOriginalLiquidado: loan.loanOriginalId } : {}),
    },
  })

  return NextResponse.json({
    message: esRenovacion
      ? 'Renovación aprobada — crédito anterior liquidado · Pendiente de activación por el coordinador'
      : 'Crédito aprobado — pendiente de activación por el coordinador',
  })
}
