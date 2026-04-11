import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { z } from 'zod'

const patchSchema = z.object({
  fechaVencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; scheduleId: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, id: userId } = session.user

  if (rol !== 'DIRECTOR_GENERAL' && rol !== 'SUPER_ADMIN') {
    return NextResponse.json(
      { error: 'Solo el Director General puede modificar fechas del calendario' },
      { status: 403 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  // Verify the schedule belongs to a loan of this company
  const schedule = await prisma.paymentSchedule.findFirst({
    where: { id: params.scheduleId, loanId: params.id, loan: { companyId: companyId! } },
  })
  if (!schedule) return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })
  // Solo SUPER_ADMIN puede editar la fecha de un pago ya realizado
  if (schedule.estado === 'PAID' && rol !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'No se puede modificar un pago ya realizado' }, { status: 400 })
  }

  const prevFecha = schedule.fechaVencimiento
  // Parse date as local date (avoid UTC shift)
  const [year, month, day] = parsed.data.fechaVencimiento.split('-').map(Number)
  const nuevaFecha = new Date(year, month - 1, day, 12, 0, 0)

  await prisma.paymentSchedule.update({
    where: { id: params.scheduleId },
    data: { fechaVencimiento: nuevaFecha },
  })

  createAuditLog({
    userId,
    accion: 'DG_EDIT_SCHEDULE_DATE',
    tabla: 'PaymentSchedule',
    registroId: params.scheduleId,
    valoresAnteriores: { fechaVencimiento: prevFecha },
    valoresNuevos: { fechaVencimiento: nuevaFecha },
  })

  return NextResponse.json({ message: 'Fecha actualizada' })
}
