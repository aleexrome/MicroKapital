import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { generarFechasHabiles } from '@/lib/business-days'
import { z } from 'zod'

const patchSchema = z.object({
  fechaVencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
})

/** Desplaza una fecha UTC (almacenada en BD) N días y devuelve la nueva fecha a mediodía local. */
function shiftDate(dbDate: Date, deltaDays: number): Date {
  return new Date(
    dbDate.getUTCFullYear(),
    dbDate.getUTCMonth(),
    dbDate.getUTCDate() + deltaDays,
    12, 0, 0,
  )
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; scheduleId: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, id: userId } = session.user

  const esOpAdmin = rol === 'DIRECTOR_GENERAL' || rol === 'SUPER_ADMIN'

  if (!esOpAdmin) {
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
    select: {
      id: true, numeroPago: true, fechaVencimiento: true, estado: true,
      loan: { select: { tipo: true } },
    },
  })
  if (!schedule) return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })

  if (schedule.estado === 'PAID' && !esOpAdmin) {
    return NextResponse.json({ error: 'No se puede modificar un pago ya realizado' }, { status: 400 })
  }

  const prevFecha = schedule.fechaVencimiento

  // Nueva fecha a mediodía local (evita desfase UTC)
  const [year, month, day] = parsed.data.fechaVencimiento.split('-').map(Number)
  const nuevaFecha = new Date(year, month - 1, day, 12, 0, 0)

  // Delta en días entre la fecha anterior y la nueva
  const oldLocal = new Date(
    prevFecha.getUTCFullYear(),
    prevFecha.getUTCMonth(),
    prevFecha.getUTCDate(),
    12, 0, 0,
  )
  const deltaDays = Math.round((nuevaFecha.getTime() - oldLocal.getTime()) / 86_400_000)

  const esAgil = schedule.loan.tipo === 'AGIL'

  // Pagos siguientes al editado (mismo crédito, numeroPago mayor)
  const siguientes = deltaDays !== 0
    ? await prisma.paymentSchedule.findMany({
        where: { loanId: params.id, numeroPago: { gt: schedule.numeroPago } },
        select: { id: true, fechaVencimiento: true },
        orderBy: { numeroPago: 'asc' },
      })
    : []

  // AGIL cobra solo en días hábiles: los pagos siguientes se recalculan
  // como días hábiles consecutivos desde la nueva fecha. Un desplazamiento
  // parejo de calendario (deltaDays) los metería en sábado/domingo.
  // El resto de productos sí usa el desplazamiento parejo.
  const fechasSiguientes = esAgil
    ? generarFechasHabiles(nuevaFecha, siguientes.length)
    : siguientes.map((s) => shiftDate(s.fechaVencimiento, deltaDays))

  await prisma.$transaction(async (tx) => {
    // 1. Actualizar el pago editado
    await tx.paymentSchedule.update({
      where: { id: params.scheduleId },
      data: { fechaVencimiento: nuevaFecha },
    })

    // 2. Recalcular/desplazar en cascada los pagos siguientes
    for (let i = 0; i < siguientes.length; i++) {
      await tx.paymentSchedule.update({
        where: { id: siguientes[i].id },
        data: { fechaVencimiento: fechasSiguientes[i] },
      })
    }
  })

  createAuditLog({
    userId,
    accion: 'DG_EDIT_SCHEDULE_DATE',
    tabla: 'PaymentSchedule',
    registroId: params.scheduleId,
    valoresAnteriores: { fechaVencimiento: prevFecha },
    valoresNuevos: {
      fechaVencimiento: nuevaFecha,
      deltaDias: deltaDays,
      siguientesDesplazados: siguientes.length,
    },
  })

  const plural = siguientes.length > 1 ? 's' : ''
  const msg = deltaDays === 0
    ? 'Fecha sin cambios'
    : siguientes.length > 0
      ? esAgil
        ? `Fecha actualizada. ${siguientes.length} pago${plural} siguiente${plural} recalculado${plural} a días hábiles.`
        : `Fecha actualizada. ${siguientes.length} pago${plural} siguiente${plural} desplazado${plural} ${deltaDays > 0 ? '+' : ''}${deltaDays} día${Math.abs(deltaDays) !== 1 ? 's' : ''}.`
      : 'Fecha actualizada'

  return NextResponse.json({ message: msg })
}
