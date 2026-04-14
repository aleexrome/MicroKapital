import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { z } from 'zod'
import { UserRole } from '@prisma/client'

const patchSchema = z.object({
  activo: z.boolean().optional(),
  rol: z.nativeEnum(UserRole).optional(),
  nombre: z.string().min(2).optional(),
  permisoAplicarPagos: z.boolean().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user || session.user.rol !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const user = await prisma.user.findUnique({ where: { id: params.id } })
  if (!user) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

  const updated = await prisma.user.update({
    where: { id: params.id },
    data: parsed.data,
    select: { id: true, nombre: true, activo: true, rol: true },
  })

  createAuditLog({
    userId: session.user.id,
    accion: 'ADMIN_UPDATE_USER',
    tabla: 'User',
    registroId: params.id,
    valoresNuevos: parsed.data,
  })

  return NextResponse.json({ data: updated })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user || session.user.rol !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const user = await prisma.user.findUnique({ where: { id: params.id } })
  if (!user) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
  if (user.id === session.user.id) {
    return NextResponse.json({ error: 'No puedes eliminar tu propia cuenta' }, { status: 400 })
  }

  // Soft delete: just deactivate
  await prisma.user.update({ where: { id: params.id }, data: { activo: false } })

  createAuditLog({
    userId: session.user.id,
    accion: 'ADMIN_DELETE_USER',
    tabla: 'User',
    registroId: params.id,
    valoresNuevos: { activo: false },
  })

  return NextResponse.json({ message: 'Cuenta desactivada' })
}
