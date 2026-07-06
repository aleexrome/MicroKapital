import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { z } from 'zod'

const reviewSchema = z.object({
  nota: z.string().max(2000).nullable(),
})

/**
 * Mesa de Control marca una observación libre sobre un documento del
 * expediente del cliente (por ejemplo "la INE no es legible"). Pasar
 * `nota: null` limpia la observación. `revisadoAt` se actualiza cada vez.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; docId: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, id: userId } = session.user

  if (rol !== 'MESA_CONTROL' && rol !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Sin permisos para observar documentos' }, { status: 403 })
  }

  const doc = await prisma.clientDocument.findFirst({
    where: {
      id: params.docId,
      clientId: params.id,
      client: { companyId: companyId! },
    },
    select: { id: true },
  })
  if (!doc) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const parsed = reviewSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const nota = parsed.data.nota?.trim() || null

  await prisma.clientDocument.update({
    where: { id: params.docId },
    data: {
      revisionNota: nota,
      revisadoAt: new Date(),
    },
  })

  createAuditLog({
    userId,
    accion: 'REVIEW_CLIENT_DOCUMENT',
    tabla: 'ClientDocument',
    registroId: params.docId,
    valoresNuevos: { revisionNota: nota },
  })

  return NextResponse.json({ ok: true })
}
