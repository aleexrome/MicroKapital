import { NextRequest, NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { receptoresValidosPara } from '@/lib/cortes'

// Vercel Hobby default es 10s. El upload a Cloudinary + prisma update
// puede tomar más desde celular con red lenta — subimos a 60s para
// evitar 504 silenciosos que dejan al coord atascado.
export const maxDuration = 60

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
  if (corte.tipo === 'CONSOLIDADO') {
    return NextResponse.json({
      error: 'Un CONSOLIDADO se entrega vía /api/cortes/consolidado/[id]/entregar',
    }, { status: 400 })
  }
  // Idempotente: si el corte ya está entregado o aceptado, el usuario
  // no está bloqueado — devolvemos OK para que el front simplemente
  // refresque y lo saque de la pantalla congelada. Evita el 409 que
  // aparece cuando una segunda pestaña o un doble submit intenta
  // volver a entregarlo (y confunde al coord con "esperando aceptación
  // del receptor" cuando en realidad el bloqueo ya se levantó).
  if (corte.estado === 'ENTREGADO' || corte.estado === 'ACEPTADO') {
    return NextResponse.json({
      ok: true,
      alreadyDelivered: true,
      estado:           corte.estado,
    })
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

  // Upload foto a Cloudinary — con manejo explícito de errores para que
  // si falla (credenciales mal, red caída, timeout) el coord vea un
  // mensaje claro en vez de un 500 opaco que lo deja atascado.
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    return NextResponse.json({
      error: 'Cloudinary no está configurado en el servidor. Avisa a sistemas.',
    }, { status: 500 })
  }
  let upload: { url: string }
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    upload = await new Promise<{ url: string }>((resolve, reject) => {
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
          if (error || !result) return reject(error ?? new Error('Cloudinary respondió vacío'))
          resolve({ url: result.secure_url })
        },
      )
      stream.end(buffer)
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[cortes/entregar] cloudinary upload failed:', msg)
    return NextResponse.json({
      error: `No se pudo subir la foto: ${msg}. Reintenta en un momento o reduce el tamaño de la imagen.`,
    }, { status: 502 })
  }

  // Para PARCIAL: NO refrescamos totales en la entrega. El snapshot
  // incremental se congela al IniciarParcial — si el user cobró más
  // efectivo entre abrir el parcial y entregarlo, eso va al próximo
  // parcial, no a este. (Antes del rework se refrescaba porque solo
  // había 1 corte por día.)
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
      receptorId:     parsed.data.receptorId,
      totalAEntregar: Number(corte.totalAEntregar),
      numeroCorte:    corte.numeroCorte,
    },
  })

  return NextResponse.json({ ok: true, fotoUrl: upload.url })
}
