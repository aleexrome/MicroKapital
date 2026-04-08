import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const ALLOWED_ROLES = ['COORDINADOR', 'COBRADOR', 'GERENTE', 'GERENTE_ZONAL', 'DIRECTOR_GENERAL', 'SUPER_ADMIN']

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { companyId } = session.user

  const loan = await prisma.loan.findFirst({
    where: { id: params.id, companyId: companyId! },
    select: { id: true },
  })
  if (!loan) return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })

  const docs = await prisma.loanDocument.findMany({
    where: { loanId: params.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      tipo: true,
      archivoUrl: true,
      descripcion: true,
      createdAt: true,
      uploadedBy: { select: { nombre: true } },
    },
  })

  return NextResponse.json({ documents: docs })
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, id: userId } = session.user

  if (!ALLOWED_ROLES.includes(rol)) {
    return NextResponse.json({ error: 'Sin permisos para subir documentos' }, { status: 403 })
  }

  const loan = await prisma.loan.findFirst({
    where: { id: params.id, companyId: companyId! },
    select: { id: true },
  })
  if (!loan) return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const tipo = formData.get('tipo') as string | null
  const descripcion = formData.get('descripcion') as string | null

  if (!file || !tipo) {
    return NextResponse.json({ error: 'Archivo y tipo son requeridos' }, { status: 400 })
  }

  // Upload to Cloudinary
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  const uploadResult = await new Promise<{ secure_url: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'microkapital/documentos',
        resource_type: 'auto',
        public_id: `loan_${params.id}_${tipo}_${Date.now()}`,
      },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Upload failed'))
        resolve(result as { secure_url: string })
      }
    )
    stream.end(buffer)
  })

  const doc = await prisma.loanDocument.create({
    data: {
      loanId:    params.id,
      subidoPor: userId,
      tipo,
      archivoUrl: uploadResult.secure_url,
      descripcion: descripcion ?? null,
    },
    select: {
      id: true,
      tipo: true,
      archivoUrl: true,
      descripcion: true,
      createdAt: true,
      uploadedBy: { select: { nombre: true } },
    },
  })

  return NextResponse.json({ document: doc }, { status: 201 })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, id: userId } = session.user
  if (!ALLOWED_ROLES.includes(rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { documentId } = await req.json().catch(() => ({}))
  if (!documentId) return NextResponse.json({ error: 'documentId requerido' }, { status: 400 })

  // Verify the document belongs to this loan and company
  const doc = await prisma.loanDocument.findFirst({
    where: {
      id: documentId,
      loanId: params.id,
      loan: { companyId: companyId! },
    },
  })
  if (!doc) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })

  // Only uploader or director/admin can delete
  const canDelete = doc.subidoPor === userId || rol === 'DIRECTOR_GENERAL' || rol === 'SUPER_ADMIN'
  if (!canDelete) return NextResponse.json({ error: 'Sin permisos para eliminar' }, { status: 403 })

  await prisma.loanDocument.delete({ where: { id: documentId } })

  return NextResponse.json({ ok: true })
}
