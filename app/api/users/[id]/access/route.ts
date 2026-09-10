import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { createAuditLog } from '@/lib/audit'

/**
 * PATCH /api/users/[id]/access
 *
 * Prende o apaga las credenciales de un usuario en tiempo real. Al poner
 * `activo=false`:
 *   - la proxima llamada a getSession() ve activo=false y regresa null,
 *   - el layout /(dashboard) redirecciona a /login,
 *   - los API endpoints protegidos rechazan con 401.
 * O sea, el kick ocurre en la proxima interaccion sin necesidad de
 * websocket ni polling — el flag ya se refresca en cada request.
 *
 * Politicas:
 *   - Solo DIRECTOR_GENERAL, DIRECTOR_COMERCIAL y SUPER_ADMIN pueden
 *     tocar el switch.
 *   - Nadie puede kickearse a si mismo (evita quedarte fuera por error).
 *   - El target debe pertenecer a la misma empresa que quien llama.
 *   - SUPER_ADMIN no se puede tocar desde aqui (solo desde /sys-mnt-9x7k).
 */
const bodySchema = z.object({
  activo: z.boolean(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { rol, companyId, id: callerId } = session.user

  if (rol !== 'DIRECTOR_GENERAL' && rol !== 'DIRECTOR_COMERCIAL' && rol !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  if (params.id === callerId) {
    return NextResponse.json(
      { error: 'No puedes desactivar tu propia cuenta desde aqui.' },
      { status: 400 },
    )
  }

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const target = await prisma.user.findFirst({
    where: { id: params.id, companyId: companyId! },
    select: { id: true, nombre: true, rol: true, activo: true },
  })
  if (!target) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
  }
  if (target.rol === 'SUPER_ADMIN') {
    return NextResponse.json(
      { error: 'La cuenta de super admin no se toca desde aqui.' },
      { status: 403 },
    )
  }

  if (target.activo === parsed.data.activo) {
    return NextResponse.json({ data: { id: target.id, activo: target.activo } })
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { activo: parsed.data.activo },
    select: { id: true, activo: true },
  })

  createAuditLog({
    userId: callerId,
    accion: parsed.data.activo ? 'ENABLE_USER_ACCESS' : 'DISABLE_USER_ACCESS',
    tabla: 'User',
    registroId: target.id,
    valoresAnteriores: { activo: target.activo, nombre: target.nombre, rol: target.rol },
    valoresNuevos: { activo: parsed.data.activo },
    ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
  })

  return NextResponse.json({ data: updated })
}
