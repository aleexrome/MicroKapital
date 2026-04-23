import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { type Prisma } from '@prisma/client'
import { createAuditLog } from '@/lib/audit'
import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, id: userId } = session.user

  const rolesPermitidos = ['COORDINADOR', 'GERENTE', 'GERENTE_ZONAL', 'SUPER_ADMIN']
  if (!rolesPermitidos.includes(rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const loanWhere: Prisma.LoanWhereInput = { id: params.id, companyId: companyId!, estado: 'ACTIVE' }
  if (rol === 'COORDINADOR' || rol === 'GERENTE') {
    loanWhere.cobradorId = userId
  } else if (rol === 'GERENTE_ZONAL') {
    const zoneIds = session.user.zonaBranchIds
    if (zoneIds?.length) {
      loanWhere.branchId = { in: zoneIds }
    } else {
      loanWhere.cobradorId = userId
    }
  }

  const loan = await prisma.loan.findFirst({ where: loanWhere })
  if (!loan) return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })

  if (loan.desembolsoFotoUrl) {
    return NextResponse.json({ error: 'Ya existe una foto de desembolso' }, { status: 400 })
  }

  const formData = await req.formData()
  const file = formData.get('foto') as File | null
  const lat = formData.get('lat') as string | null
  const lng = formData.get('lng') as string | null

  if (!file) {
    return NextResponse.json({ error: 'Foto requerida' }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  const uploadResult = await new Promise<{ url: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'microkapital/desembolsos',
        public_id: `${loan.id}-${Date.now()}`,
        resource_type: 'image',
        type: 'upload',
        access_mode: 'public',
        quality: 'auto',
        fetch_format: 'auto',
        transformation: [{ width: 1600, crop: 'limit' }],
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error('Upload failed'))
          return
        }
        resolve({ url: result.secure_url })
      }
    )
    stream.end(buffer)
  })

  await prisma.loan.update({
    where: { id: loan.id },
    data: {
      desembolsoFotoUrl: uploadResult.url,
      desembolsoLat: lat ? parseFloat(lat) : null,
      desembolsoLng: lng ? parseFloat(lng) : null,
      desembolsoFotoAt: new Date(),
    },
  })

  createAuditLog({
    userId,
    accion: 'UPLOAD_DISBURSEMENT_PHOTO',
    tabla: 'Loan',
    registroId: loan.id,
    valoresNuevos: {
      desembolsoFotoUrl: uploadResult.url,
      lat: lat ? parseFloat(lat) : null,
      lng: lng ? parseFloat(lng) : null,
    },
  })

  return NextResponse.json({
    message: 'Foto de desembolso registrada',
    url: uploadResult.url,
  })
}
