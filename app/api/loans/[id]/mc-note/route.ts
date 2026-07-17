import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { z } from 'zod'

const schema = z.object({
  notas: z.string().max(2000).nullable(),
})

/**
 * PATCH /api/loans/[id]/mc-note
 *
 * Actualiza la nota general de Mesa de Control (Loan.revisionNotasGenerales)
 * de una solicitud ya revisada. Diseñado para que MC (o DG/DC) pueda
 * añadir/ajustar observaciones desde el reporte semanal antes de
 * imprimirlo, sin cambiar el estado del préstamo.
 *
 * Permitido para: MESA_CONTROL, DIRECTOR_GENERAL, DIRECTOR_COMERCIAL,
 * SUPER_ADMIN. Se registra auditoría con el valor anterior.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, id: userId } = session.user
  const permitido =
    rol === 'MESA_CONTROL' ||
    rol === 'DIRECTOR_GENERAL' ||
    rol === 'DIRECTOR_COMERCIAL' ||
    rol === 'SUPER_ADMIN'
  if (!permitido) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const loan = await prisma.loan.findFirst({
    where: { id: params.id, companyId: companyId! },
    select: { id: true, revisionNotasGenerales: true },
  })
  if (!loan) return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const nuevo = parsed.data.notas?.trim() || null

  await prisma.loan.update({
    where: { id: loan.id },
    data: { revisionNotasGenerales: nuevo },
  })

  createAuditLog({
    userId,
    accion: 'MESA_CONTROL_EDIT_NOTE',
    tabla: 'Loan',
    registroId: loan.id,
    valoresAnteriores: { revisionNotasGenerales: loan.revisionNotasGenerales },
    valoresNuevos:     { revisionNotasGenerales: nuevo },
  })

  return NextResponse.json({ message: 'Observación actualizada' })
}
