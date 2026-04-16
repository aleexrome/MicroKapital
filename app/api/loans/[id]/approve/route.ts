import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generarFechasSemanales, generarFechasHabiles } from '@/lib/business-days'
import { createAuditLog } from '@/lib/audit'
import { z } from 'zod'

const approveSchema = z.object({
  notas: z.string().optional(),
  fechaDesembolso: z.string().optional(),
  avalOverride: z.boolean().optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, id: userId } = session.user

  if (rol !== 'GERENTE' && rol !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const loan = await prisma.loan.findFirst({
    where: { id: params.id, companyId: companyId! },
  })

  if (!loan) return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })
  if (loan.estado !== 'PENDING_APPROVAL') {
    return NextResponse.json({ error: 'El préstamo no está pendiente de aprobación' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = approveSchema.safeParse(body)
  const { notas, fechaDesembolso: fechaStr, avalOverride } = parsed.success ? parsed.data : {}

  const fechaDesembolso = fechaStr ? new Date(fechaStr) : new Date()

  await prisma.$transaction(async (tx) => {
    // Actualizar préstamo
    await tx.loan.update({
      where: { id: loan.id },
      data: {
        estado: 'ACTIVE',
        aprobadoPorId: userId,
        aprobadoAt: new Date(),
        fechaDesembolso,
      },
    })

    // Actualizar registro de aprobación
    await tx.loanApproval.updateMany({
      where: { loanId: loan.id, estado: 'PENDING' },
      data: {
        estado: 'APPROVED',
        revisadoPorId: userId,
        revisadoAt: new Date(),
        notas: notas ?? null,
      },
    })

    // Generar calendario de pagos
    let fechas: Date[]
    if (loan.tipo === 'AGIL') {
      fechas = generarFechasHabiles(fechaDesembolso, 24)
    } else {
      fechas = generarFechasSemanales(fechaDesembolso, loan.plazo)
    }

    const montoPorPago = loan.tipo === 'AGIL'
      ? Number(loan.pagoDiario)
      : Number(loan.pagoSemanal)

    const scheduleData = fechas.map((fecha, idx) => ({
      loanId: loan.id,
      numeroPago: idx + 1,
      fechaVencimiento: fecha,
      montoEsperado: montoPorPago,
      estado: 'PENDING' as const,
    }))

    await tx.paymentSchedule.createMany({ data: scheduleData })
  })

  createAuditLog({
    userId,
    accion: 'APPROVE_LOAN',
    tabla: 'Loan',
    registroId: loan.id,
    valoresNuevos: { estado: 'ACTIVE', aprobadoPorId: userId },
  })

  // Log aval override separately for traceability
  if (avalOverride) {
    createAuditLog({
      userId,
      accion: 'AVAL_OVERRIDE',
      tabla: 'Loan',
      registroId: loan.id,
      valoresNuevos: {
        motivo: 'Aprobación con aval en mora — consciente del riesgo',
        aprobadoPorId: userId,
      },
    })
  }

  return NextResponse.json({ message: 'Préstamo aprobado y calendario generado' })
}
