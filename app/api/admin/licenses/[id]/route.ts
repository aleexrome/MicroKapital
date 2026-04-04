import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { createAuditLog } from '@/lib/audit'
import { invalidateLicenseCache } from '@/lib/license-check'

const patchSchema = z.object({
  estado: z.enum(['ACTIVE', 'SUSPENDED', 'GRACE', 'CANCELLED']).optional(),
  precioMensual: z.number().positive().optional(),
  diaCobro: z.number().int().min(1).max(28).optional(),
  notasInternas: z.string().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user || session.user.rol !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const license = await prisma.license.findUnique({ where: { id: params.id } })
  if (!license) return NextResponse.json({ error: 'Licencia no encontrada' }, { status: 404 })

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const updated = await prisma.license.update({
    where: { id: params.id },
    data: {
      ...parsed.data,
      ultimaVerificacion: new Date(),
    },
  })

  // Invalidar cache de licencia
  invalidateLicenseCache(license.companyId)

  createAuditLog({
    userId: session.user.id,
    accion: 'UPDATE_LICENSE',
    tabla: 'License',
    registroId: params.id,
    valoresAnteriores: { estado: license.estado },
    valoresNuevos: parsed.data,
  })

  return NextResponse.json({ data: updated })
}
