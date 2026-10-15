import { NextRequest, NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { receptoresValidosPara } from '@/lib/cortes'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const schema = z.object({
  receptorId: z.string().uuid(),
})

/**
 * POST /api/cortes/[id]/entregar
 *
 * El coord/concentrador sube la foto del ticket firmado + elige el
 * receptor (concentrador local o DG/DC según cadena). El corte pasa a
 * ENTREGADO y queda esperando aceptación.
 *
 * Multipart form:
 *   - receptorId (campo text)
 *   - foto       (archivo image/*)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const form = await req.formData()
  const receptorIdRaw = form.get('receptorId')
  const file = form.get('foto')

  const parsed = schema.safeParse({ receptorId: receptorIdRaw })
  if (!parsed.success) {
    return NextResponse.json({ error: 'receptorId inválido' }, { status: 400 })
  }
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Falta la foto del ticket firmado' }, { status: 400 })
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Solo se aceptan imágenes' }, { status: 400 })
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'La foto excede 10MB' }, { status: 400 })
  }

  const corte = await prisma.corte.findFirst({
    where: {
      id:        params.id,
      userId:    session.user.id,
      companyId: session.user.companyId!,
    },
  })
  if (!corte) return NextResponse.json({ error: 'Corte no encontrado' }, { status: 404 })
  if (corte.estado === 'ENTREGADO') {
    return NextResponse.json({ error: 'Ya está entregado, esperando aceptación del receptor' }, { status: 409 })
  }
  if (corte.estado === 'ACEPTADO') {
    return NextResponse.json({ error: 'Este corte ya fue aceptado y cerrado' }, { status: 409 })
  }

  // Validar que el receptor elegido está en la lista de receptores
  // permitidos para este user (según su sucursal + cadena).
  const permitidos = await receptoresValidosPara(prisma, {
    id:        session.user.id,
    branchId:  session.user.branchId,
    companyId: session.user.companyId,
  })
  if (!permitidos.find((r) => r.id === parsed.data.receptorId)) {
    return NextResponse.json(
      { error: 'Receptor inválido para tu sucursal/cadena' },
      { status: 400 },
    )
  }

  // Upload foto a Cloudinary
  const buffer = Buffer.from(await file.arrayBuffer())
  const upload = await new Promise<{ url: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'microkapital/cortes-ticket',
        public_id: `${corte.id}-${Date.now()}`,
        resource_type: 'image',
        type: 'upload',
        access_mode: 'public',
        quality: 'auto',
        fetch_format: 'auto',
        transformation: [{ width: 1600, crop: 'limit' }],
      },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Upload falló'))
        resolve({ url: result.secure_url })
      },
    )
    stream.end(buffer)
  })

  const now = new Date()
  await prisma.corte.update({
    where: { id: corte.id },
    data: {
      receptorId:    parsed.data.receptorId,
      fotoTicketUrl: upload.url,
      fotoTicketAt:  now,
      entregadoAt:   now,
      estado:        'ENTREGADO',
      // Si venía de RECHAZADO, limpiamos la razón previa (es un nuevo intento).
      rechazadoAt:   null,
      rechazoRazon:  null,
    },
  })

  createAuditLog({
    userId:        session.user.id,
    accion:        'CORTE_ENTREGADO',
    tabla:         'Corte',
    registroId:    corte.id,
    valoresNuevos: {
      receptorId:   parsed.data.receptorId,
      totalAEntregar: Number(corte.totalAEntregar),
    },
  })

  return NextResponse.json({ ok: true, fotoUrl: upload.url })
}
