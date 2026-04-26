import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'

/**
 * DELETE — soft-delete del grupo solidario. Setea `eliminadoEn = now()`.
 * El grupo y sus loans desaparecen de cartera, agenda, rutas, dashboard
 * y cobranzas presentes (historial pasado en /rutas/<semana> NO cambia).
 *
 * Reversible mientras no se cumplan 14 días — basta poner el campo en
 * NULL. Pasados los 14 días el cron `/api/cron/purge-deleted` lo borra
 * de la BD.
 *
 * Solo DIRECTOR_GENERAL.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { groupId: string } }
) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { rol, companyId, id: userId } = session.user
  if (rol !== 'DIRECTOR_GENERAL') {
    return NextResponse.json(
      { error: 'Solo Dirección General puede eliminar grupos' },
      { status: 403 },
    )
  }

  // Verificamos que el grupo exista en la empresa del DG (vía cualquier
  // loan del grupo — LoanGroup no tiene companyId directo).
  const group = await prisma.loanGroup.findFirst({
    where: {
      id: params.groupId,
      branch: { companyId: companyId! },
    },
    select: { id: true, nombre: true, eliminadoEn: true },
  })
  if (!group) {
    return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 })
  }
  if (group.eliminadoEn) {
    return NextResponse.json({ error: 'El grupo ya estaba eliminado' }, { status: 400 })
  }

  const now = new Date()
  await prisma.loanGroup.update({
    where: { id: params.groupId },
    data: { eliminadoEn: now },
  })

  createAuditLog({
    userId,
    accion: 'DELETE_SOFT',
    tabla: 'LoanGroup',
    registroId: params.groupId,
    valoresAnteriores: { nombre: group.nombre, eliminadoEn: null },
    valoresNuevos: { eliminadoEn: now.toISOString() },
    ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
  })

  return NextResponse.json({
    message: 'Grupo eliminado. Se purgará automáticamente a los 14 días.',
  })
}
