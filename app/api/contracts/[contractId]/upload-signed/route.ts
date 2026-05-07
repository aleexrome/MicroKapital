import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { v2 as cloudinary } from 'cloudinary'
import { createAuditLog } from '@/lib/audit'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const ACCEPTED_MIME = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_BYTES = 10 * 1024 * 1024  // 10MB

/**
 * POST /api/contracts/[contractId]/upload-signed
 *
 * Sube el contrato firmado por el cliente (PDF o imagen) y lo asocia al
 * Contract creando un LoanDocument tipo CONTRATO_FIRMADO. Si ya había un
 * documento firmado vinculado, lo reemplaza (borra el LoanDocument viejo).
 *
 * Permisos:
 *  - SUPER_ADMIN
 *  - El COORDINADOR o GERENTE asignado al loan asociado al contrato
 *  - GERENTE_ZONAL si el branch del loan está en su zonaBranchIds
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

  // Cargar el Contract con el loan asociado
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

  // Validación de permisos
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

  // Recibir el archivo
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 })
  }
  if (!ACCEPTED_MIME.includes(file.type)) {
    return NextResponse.json(
      { error: 'Tipo de archivo no permitido. Usa PDF, JPG o PNG.' },
      { status: 400 }
    )
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'Archivo demasiado grande. Máximo 10MB.' },
      { status: 400 }
    )
  }

  // Subir a Cloudinary
  let secureUrl: string
  try {
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const resourceType = file.type === 'application/pdf' ? 'raw' : 'image'
    const isPdf = file.type === 'application/pdf'

    const uploadResult = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'microkapital/contratos-firmados',
          resource_type: resourceType,
          type: 'upload',
          public_id: isPdf
            ? `${contract.numeroContrato}-firmado-${Date.now()}.pdf`
            : `${contract.numeroContrato}-firmado-${Date.now()}`,
        },
        (error, result) => {
          if (error || !result) return reject(error ?? new Error('Cloudinary upload failed'))
          resolve(result as { secure_url: string })
        }
      )
      stream.end(buffer)
    })

    secureUrl = isPdf && !uploadResult.secure_url.endsWith('.pdf')
      ? `${uploadResult.secure_url}.pdf`
      : uploadResult.secure_url
  } catch (err) {
    console.error('[UploadSignedContract] cloudinary error:', err)
    const message = err instanceof Error ? err.message : 'Error al subir documento'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  // Persistir: si ya había documento firmado, lo reemplazamos
  const result = await prisma.$transaction(async (tx) => {
    // Si ya hay LoanDocument firmado anterior, lo borramos para mantener uno solo
    if (contract.loanDocumentFirmadoId) {
      // Desvincular primero del Contract para evitar foreign key
      await tx.contract.update({
        where: { id: contract.id },
        data: { loanDocumentFirmadoId: null },
      })
      await tx.loanDocument.delete({
        where: { id: contract.loanDocumentFirmadoId },
      }).catch(() => {})  // si ya no existe, ignorar
    }

    const newDoc = await tx.loanDocument.create({
      data: {
        loanId:    loan.id,
        subidoPor: userId,
        tipo:      'CONTRATO_FIRMADO',
        archivoUrl: secureUrl,
        descripcion: `Contrato firmado — folio ${contract.numeroContrato}`,
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
    },
  })

  return NextResponse.json({
    ok: true,
    loanDocumentId: result.id,
    url: secureUrl,
  })
}
