import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'

const schema = z.object({
  concentradorUserId: z.string().uuid().nullable(),
})

/**
 * PUT /api/admin/branches/[id]/concentrador
 *
 * DG / SA cambia el concentrador local de una sucursal (para cuando
 * alguien se da de baja o rota el rol). Null = sin concentrador local
 * — los coords de esa sucursal entregan directo a DG/DC.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!['DIRECTOR_GENERAL', 'SUPER_ADMIN'].includes(session.user.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const body   = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'concentradorUserId inválido' }, { status: 400 })
  }

  const branch = await prisma.branch.findFirst({
    where: { id: params.id, companyId: session.user.companyId! },
  })
  if (!branch) return NextResponse.json({ error: 'Sucursal no encontrada' }, { status: 404 })

  // Si se setea un user, validar que exista en la misma empresa + esté activo.
  if (parsed.data.concentradorUserId) {
    const u = await prisma.user.findFirst({
      where: {
        id:        parsed.data.concentradorUserId,
        companyId: session.user.companyId!,
        activo:    true,
      },
      select: { id: true },
    })
    if (!u) return NextResponse.json({ error: 'Usuario inválido o inactivo' }, { status: 400 })
  }

  await prisma.branch.update({
    where: { id: branch.id },
    data:  { concentradorUserId: parsed.data.concentradorUserId },
  })

  createAuditLog({
    userId:        session.user.id,
    accion:        'CAMBIAR_CONCENTRADOR_SUCURSAL',
    tabla:         'Branch',
    registroId:    branch.id,
    valoresNuevos: { concentradorUserId: parsed.data.concentradorUserId },
    valoresAnteriores: { concentradorUserId: branch.concentradorUserId },
  })

  return NextResponse.json({ ok: true })
}
