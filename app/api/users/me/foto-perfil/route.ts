import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const MAX_BYTES = 5 * 1024 * 1024 // 5MB

/**
 * POST /api/users/me/foto-perfil
 *
 * Sube la foto de perfil del usuario autenticado. El frontend envía
 * la imagen YA RECORTADA a cuadrado (via react-easy-crop) para que la
 * presentación circular con object-cover no deforme el contenido.
 *
 * El archivo llega como multipart/form-data con el campo 'foto'.
 * Cloudinary la aloja en folder 'microkapital/avatars' y la foto se
 * limita a 400×400 (más que suficiente para avatar).
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const userId = session.user.id

  const formData = await req.formData()
  const file = formData.get('foto') as File | null
  if (!file) {
    return NextResponse.json({ error: 'Archivo "foto" requerido' }, { status: 400 })
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'El archivo debe ser una imagen' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Imagen demasiado grande (máx 5MB)' }, { status: 400 })
  }

  const bytes  = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  const uploadResult = await new Promise<{ url: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder:       'microkapital/avatars',
        public_id:    `${userId}-${Date.now()}`,
        resource_type: 'image',
        type:         'upload',
        access_mode:  'public',
        quality:      'auto',
        fetch_format: 'auto',
        // Cap a 400x400 — la UI usa máximo 44-80px pero algún día
        // alguien puede querer verla en un detalle más grande.
        transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'center' }],
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error('Upload failed'))
          return
        }
        resolve({ url: result.secure_url })
      },
    )
    stream.end(buffer)
  })

  await prisma.user.update({
    where: { id: userId },
    data:  { fotoPerfilUrl: uploadResult.url },
  })

  createAuditLog({
    userId,
    accion:     'UPDATE_FOTO_PERFIL',
    tabla:      'User',
    registroId: userId,
    valoresNuevos: { fotoPerfilUrl: uploadResult.url },
  })

  return NextResponse.json({ ok: true, url: uploadResult.url })
}

/**
 * DELETE /api/users/me/foto-perfil
 *
 * Quita la foto de perfil (vuelve a mostrar iniciales).
 * No elimina el asset de Cloudinary — solo borra la referencia.
 */
export async function DELETE() {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const userId = session.user.id

  await prisma.user.update({
    where: { id: userId },
    data:  { fotoPerfilUrl: null },
  })

  createAuditLog({
    userId,
    accion:     'REMOVE_FOTO_PERFIL',
    tabla:      'User',
    registroId: userId,
  })

  return NextResponse.json({ ok: true })
}
