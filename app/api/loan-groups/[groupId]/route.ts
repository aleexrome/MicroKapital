import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'

const ROLES_EDITAN_NOMBRE = ['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'SUPER_ADMIN'] as const

const patchSchema = z.object({
  nombre: z.string().trim().min(1, 'Nombre requerido').max(120, 'Máximo 120 caracteres'),
})

/**
 * PATCH — editar el nombre del grupo solidario.
 *
 * Solo DIRECTOR_GENERAL, DIRECTOR_COMERCIAL y SUPER_ADMIN. Pensado para
 * corregir typos / nombres mal escritos por los coordinadores al crear
 * el grupo. No toca tipoGrupo, miembros ni loans — solo el nombre.
 *
 * El nombre se guarda en MAYÚSCULAS (consistente con cómo se captura
 * en el formulario de creación).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { groupId: string } }
) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { rol, companyId, id: userId } = session.user
  if (!ROLES_EDITAN_NOMBRE.includes(rol as typeof ROLES_EDITAN_NOMBRE[number])) {
    return NextResponse.json(
      { error: 'Solo Dirección General o Comercial pueden editar nombres de grupos' },
      { status: 403 },
    )
  }

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' },
      { status: 400 },
    )
  }

  const nombreNormalizado = parsed.data.nombre.toUpperCase().trim()

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
    return NextResponse.json({ error: 'El grupo está eliminado' }, { status: 400 })
  }
  if (group.nombre === nombreNormalizado) {
    return NextResponse.json({ message: 'El nombre no cambió', nombre: group.nombre })
  }

  await prisma.loanGroup.update({
    where: { id: params.groupId },
    data: { nombre: nombreNormalizado },
  })

  createAuditLog({
    userId,
    accion: 'UPDATE',
    tabla: 'LoanGroup',
    registroId: params.groupId,
    valoresAnteriores: { nombre: group.nombre },
    valoresNuevos: { nombre: nombreNormalizado },
    ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
  })

  return NextResponse.json({
    message: 'Nombre actualizado',
    nombre: nombreNormalizado,
  })
}

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
