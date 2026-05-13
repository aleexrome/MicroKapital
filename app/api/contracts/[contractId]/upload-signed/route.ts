import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { v2 as cloudinary } from 'cloudinary'
import { createAuditLog } from '@/lib/audit'
import { Document, Page, Image, renderToBuffer } from '@react-pdf/renderer'
import React from 'react'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const MAX_BYTES_PER_FILE = 10 * 1024 * 1024  // 10MB por archivo
const MAX_BYTES_TOTAL    = 25 * 1024 * 1024  // 25MB total combinado

function isPdfFile(f: File): boolean {
  // Algunos teléfonos reportan PDF como application/octet-stream — usamos
  // también la extensión del nombre como respaldo.
  return f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
}

function isImageFile(f: File): boolean {
  if (f.type.startsWith('image/')) return true
  return /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name)
}

function imageFormatFromFile(f: File): 'jpg' | 'png' | null {
  if (f.type === 'image/jpeg' || /\.jpe?g$/i.test(f.name)) return 'jpg'
  if (f.type === 'image/png'  || /\.png$/i.test(f.name))  return 'png'
  // HEIC/HEIF/WEBP no son nativos de @react-pdf — los rechazamos abajo
  // con un mensaje claro para que el cliente convierta a JPG/PNG.
  return null
}

/**
 * POST /api/contracts/[contractId]/upload-signed
 *
 * Sube el contrato firmado por el cliente. Acepta:
 *  - Un único archivo PDF, que se sube tal cual.
 *  - Uno o varios archivos de imagen (JPG/PNG) que se combinan en un PDF
 *    (una página por imagen) antes de subir.
 *
 * Si ya había un documento firmado vinculado, lo reemplaza.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { contractId: string } }
) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { rol, companyId, id: userId, zonaBranchIds } = session.user

  const contract = await prisma.contract.findFirst({
    where: { id: params.contractId, companyId: companyId! },
  })
  if (!contract) {
    return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 })
  }

  const loan = await prisma.loan.findFirst({
    where: { id: contract.loanId, companyId: companyId! },
    select: { id: true, cobradorId: true, branchId: true },
  })
  if (!loan) {
    return NextResponse.json({ error: 'Préstamo asociado no encontrado' }, { status: 404 })
  }

  // Permisos
  let allowed = false
  if (rol === 'SUPER_ADMIN') {
    allowed = true
  } else if (rol === 'COORDINADOR' || rol === 'GERENTE') {
    allowed = loan.cobradorId === userId
  } else if (rol === 'GERENTE_ZONAL') {
    const zoneIds = Array.isArray(zonaBranchIds) ? zonaBranchIds : []
    allowed = zoneIds.includes(loan.branchId) || loan.cobradorId === userId
  }
  if (!allowed) {
    return NextResponse.json(
      { error: 'Sin permisos para subir el contrato firmado de este préstamo' },
      { status: 403 }
    )
  }

  // Recibir archivos (uno o varios bajo el mismo nombre `file`)
  const formData = await req.formData()
  const files = formData.getAll('file').filter((f): f is File => f instanceof File)
  if (files.length === 0) {
    return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 })
  }

  // Validaciones por archivo y agregadas
  let totalBytes = 0
  for (const f of files) {
    if (f.size > MAX_BYTES_PER_FILE) {
      return NextResponse.json(
        { error: `"${f.name}" pesa más de 10MB.` },
        { status: 400 }
      )
    }
    totalBytes += f.size
    if (!isPdfFile(f) && !isImageFile(f)) {
      return NextResponse.json(
        { error: `"${f.name}" no es un formato permitido. Usa PDF, JPG o PNG.` },
        { status: 400 }
      )
    }
  }
  if (totalBytes > MAX_BYTES_TOTAL) {
    return NextResponse.json(
      { error: 'El total combinado supera 25MB. Reduce la calidad o sube menos páginas.' },
      { status: 400 }
    )
  }

  const hayPdfs = files.some(isPdfFile)
  const hayImagenes = files.some(isImageFile)
  if (hayPdfs && hayImagenes) {
    return NextResponse.json(
      { error: 'No mezcles PDF con fotos. Sube solo un PDF, o solo fotos.' },
      { status: 400 }
    )
  }
  if (hayPdfs && files.length > 1) {
    return NextResponse.json(
      { error: 'Sólo se permite un PDF. Si tiene varias páginas, combínalo en un solo PDF antes de subir.' },
      { status: 400 }
    )
  }

  // Preparar el buffer final a subir y su tipo de recurso en Cloudinary
  let finalBuffer: Buffer
  let finalIsPdf: boolean

  if (hayPdfs) {
    // Caso PDF directo: subir tal cual
    const bytes = await files[0].arrayBuffer()
    finalBuffer = Buffer.from(bytes)
    finalIsPdf = true
  } else {
    // Caso imágenes: validar formato y combinar en un PDF (una imagen por página)
    type ImgPage = { data: Buffer; format: 'jpg' | 'png' }
    const pages: ImgPage[] = []
    for (const f of files) {
      const fmt = imageFormatFromFile(f)
      if (!fmt) {
        return NextResponse.json(
          { error: `"${f.name}" usa un formato (HEIC/WebP) no soportado. Conviértelo a JPG o PNG.` },
          { status: 400 }
        )
      }
      const bytes = await f.arrayBuffer()
      pages.push({ data: Buffer.from(bytes), format: fmt })
    }

    try {
      finalBuffer = await renderToBuffer(
        React.createElement(
          Document,
          null,
          ...pages.map((p, i) =>
            React.createElement(
              Page,
              { key: i, size: 'LETTER', style: { padding: 20 } },
              React.createElement(Image, {
                src: { data: p.data, format: p.format },
                style: { width: '100%', height: '100%', objectFit: 'contain' },
              })
            )
          )
        )
      )
      finalIsPdf = true
    } catch (err) {
      console.error('[UploadSignedContract] failed to combine images:', err)
      return NextResponse.json(
        { error: 'No se pudo combinar las fotos en un PDF. Intenta con menos páginas o usa JPG.' },
        { status: 500 }
      )
    }
  }

  // Subir a Cloudinary
  let secureUrl: string
  try {
    const resourceType = finalIsPdf ? 'raw' : 'image'
    const publicId = finalIsPdf
      ? `${contract.numeroContrato}-firmado-${Date.now()}.pdf`
      : `${contract.numeroContrato}-firmado-${Date.now()}`

    const uploadResult = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'microkapital/contratos-firmados',
          resource_type: resourceType,
          type: 'upload',
          public_id: publicId,
        },
        (error, result) => {
          if (error || !result) return reject(error ?? new Error('Cloudinary upload failed'))
          resolve(result as { secure_url: string })
        }
      )
      stream.end(finalBuffer)
    })

    secureUrl = finalIsPdf && !uploadResult.secure_url.endsWith('.pdf')
      ? `${uploadResult.secure_url}.pdf`
      : uploadResult.secure_url
  } catch (err) {
    console.error('[UploadSignedContract] cloudinary error:', err)
    const message = err instanceof Error ? err.message : 'Error al subir documento'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  // Persistir: reemplazar el LoanDocument firmado anterior si existía
  const result = await prisma.$transaction(async (tx) => {
    if (contract.loanDocumentFirmadoId) {
      await tx.contract.update({
        where: { id: contract.id },
        data: { loanDocumentFirmadoId: null },
      })
      await tx.loanDocument.delete({
        where: { id: contract.loanDocumentFirmadoId },
      }).catch(() => {})
    }

    const newDoc = await tx.loanDocument.create({
      data: {
        loanId:    loan.id,
        subidoPor: userId,
        tipo:      'CONTRATO_FIRMADO',
        archivoUrl: secureUrl,
        descripcion: hayImagenes && files.length > 1
          ? `Contrato firmado — folio ${contract.numeroContrato} (${files.length} páginas combinadas)`
          : `Contrato firmado — folio ${contract.numeroContrato}`,
      },
    })

    await tx.contract.update({
      where: { id: contract.id },
      data: { loanDocumentFirmadoId: newDoc.id },
    })

    return newDoc
  })

  createAuditLog({
    userId,
    accion: 'UPLOAD_SIGNED_CONTRACT',
    tabla: 'Contract',
    registroId: contract.id,
    valoresNuevos: {
      numeroContrato: contract.numeroContrato,
      loanDocumentId: result.id,
      url: secureUrl,
      paginas: hayImagenes ? files.length : 1,
    },
  })

  return NextResponse.json({
    ok: true,
    loanDocumentId: result.id,
    url: secureUrl,
  })
}
