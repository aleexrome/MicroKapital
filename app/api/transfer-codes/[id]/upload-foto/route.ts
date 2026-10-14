import { NextRequest, NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { isCodeInactive } from '@/lib/transfer-codes'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

/**
 * POST /api/transfer-codes/[id]/upload-foto
 *
 * El coord sube el screenshot del comprobante de la transferencia que
 * acaba de hacer el cliente, ya con el código MK-XXXXXX en el concepto.
 * El archivo va a Cloudinary y la URL queda vinculada al TransferCode.
 * Esto permite subir la foto ANTES de registrar el Payment (que vendrá
 * en un segundo paso del dialog). Al registrar el Payment, la URL se
 * copia al Payment.comprobanteFotoUrl como snapshot auditable.
 *
 * Se puede re-subir mientras el código siga activo (no expirado / no
 * usado / no invalidado) — útil si la coord se equivoca de foto.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { companyId } = session.user

  const code = await prisma.transferCode.findFirst({
    where: { id: params.id, companyId: companyId! },
    select: {
      id: true,
      expiresAt: true,
      invalidatedAt: true,
      usedAt: true,
    },
  })
  if (!code) {
    return NextResponse.json({ error: 'Código no encontrado' }, { status: 404 })
  }
  if (isCodeInactive(code)) {
    return NextResponse.json(
      { error: 'Este código ya expiró o fue invalidado. Regenera uno nuevo.' },
      { status: 409 },
    )
  }

  // Parse multipart
  const form = await req.formData()
  const file = form.get('foto')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Falta el archivo "foto"' }, { status: 400 })
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Solo se aceptan imágenes' }, { status: 400 })
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'La foto excede 10MB' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const upload = await new Promise<{ url: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'microkapital/comprobantes-transferencia',
        public_id: `${code.id}-${Date.now()}`,
        resource_type: 'image',
        type: 'upload',
        access_mode: 'public',
        quality: 'auto',
        fetch_format: 'auto',
        transformation: [{ width: 1600, crop: 'limit' }],
      },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Upload failed'))
        resolve({ url: result.secure_url })
      },
    )
    stream.end(buffer)
  })

  const updated = await prisma.transferCode.update({
    where: { id: code.id },
    data: {
      comprobanteFotoUrl: upload.url,
      comprobanteFotoAt:  new Date(),
    },
    select: { comprobanteFotoUrl: true, comprobanteFotoAt: true },
  })

  return NextResponse.json({
    comprobanteFotoUrl: updated.comprobanteFotoUrl,
    comprobanteFotoAt:  updated.comprobanteFotoAt?.toISOString(),
  })
}
