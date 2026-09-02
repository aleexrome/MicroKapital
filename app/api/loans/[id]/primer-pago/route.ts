import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { parseMxYMD } from '@/lib/timezone'
import { generarFechasSemanalesDesde, generarFechasHabilesDesde } from '@/lib/business-days'

const schema = z.object({
  fechaPrimerPago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD'),
})

const ROLES_PERMITIDOS = ['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'SUPER_ADMIN'] as const

/**
 * PATCH /api/loans/[id]/primer-pago
 *
 * Actualiza la fechaPrimerPago del préstamo y REGENERA las fechas del
 * calendario (PaymentSchedule.fechaVencimiento) para que P1 caiga en la
 * nueva fecha. Uso pensado desde /reportes/aprobaciones: edición inline
 * cuando DG se dio cuenta que aprobó sin capturar fechas.
 *
 * Reglas:
 *   - Solo DG, DC o SUPER_ADMIN.
 *   - Si el préstamo ya tiene pagos capturados (Payment con scheduleId
 *     de este loan) se rechaza — desplazar fechas rompería el historial;
 *     mejor editar cada schedule uno por uno desde el detalle.
 *   - Si loan.fechaDesembolso está en NULL, se rellena con
 *     fechaPrimerPago - 7 días (default sensato para el contrato).
 *   - Si el préstamo aún no tiene schedules (APPROVED sin activar),
 *     solo guardamos la fecha; el schedule se genera al activar.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, id: userId } = session.user
  if (!ROLES_PERMITIDOS.includes(rol as typeof ROLES_PERMITIDOS[number])) {
    return NextResponse.json({ error: 'Sin permisos para editar la fecha del primer pago' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  }
  const fechaPrimerPago = parseMxYMD(parsed.data.fechaPrimerPago)

  const loan = await prisma.loan.findFirst({
    where: { id: params.id, companyId: companyId! },
    include: { schedule: { orderBy: { numeroPago: 'asc' } } },
  })
  if (!loan) return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })

  // Bloqueo si ya hay pagos — desplazar fechas romperia trazabilidad.
  if (loan.schedule.length > 0) {
    const pagosExistentes = await prisma.payment.count({
      where: { loanId: loan.id, scheduleId: { not: null } },
    })
    if (pagosExistentes > 0) {
      return NextResponse.json({
        error: 'Este crédito ya tiene pagos capturados. Edita las fechas cuota por cuota desde el detalle del préstamo.',
      }, { status: 409 })
    }
  }

  // Regenerar fechas del calendario si el schedule existe. Si NO existe
  // (APPROVED sin activar), simplemente guardamos la fecha y la activación
  // se encarga de crear el calendario después.
  const nuevasFechas = loan.schedule.length > 0
    ? (loan.tipo === 'AGIL'
        ? generarFechasHabilesDesde(fechaPrimerPago, loan.schedule.length)
        : generarFechasSemanalesDesde(fechaPrimerPago, loan.schedule.length))
    : []

  const previo = {
    fechaPrimerPago: loan.fechaPrimerPago?.toISOString() ?? null,
    fechaDesembolso: loan.fechaDesembolso?.toISOString() ?? null,
  }

  await prisma.$transaction(async (tx) => {
    // Si no tenía fechaDesembolso, le ponemos una razonable (7 días
    // antes del primer pago) para que los reportes / contrato tengan algo.
    const fechaDesembolso = loan.fechaDesembolso ?? new Date(fechaPrimerPago.getTime() - 7 * 24 * 60 * 60 * 1000)

    await tx.loan.update({
      where: { id: loan.id },
      data: {
        fechaPrimerPago,
        fechaDesembolso,
      },
    })

    if (nuevasFechas.length > 0) {
      for (let i = 0; i < loan.schedule.length; i++) {
        await tx.paymentSchedule.update({
          where: { id: loan.schedule[i].id },
          data: { fechaVencimiento: nuevasFechas[i] },
        })
      }
    }
  })

  createAuditLog({
    userId,
    accion: 'UPDATE_FECHA_PRIMER_PAGO',
    tabla: 'Loan',
    registroId: loan.id,
    valoresAnteriores: previo,
    valoresNuevos: {
      fechaPrimerPago: fechaPrimerPago.toISOString(),
      schedulesRegenerados: nuevasFechas.length,
    },
    ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
  })

  return NextResponse.json({
    message: nuevasFechas.length > 0
      ? `Fecha actualizada y ${nuevasFechas.length} cuotas del calendario regeneradas.`
      : 'Fecha guardada. El calendario se generará al activar el crédito.',
    fechaPrimerPago: fechaPrimerPago.toISOString(),
  })
}
