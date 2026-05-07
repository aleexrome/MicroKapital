import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { v2 as cloudinary } from 'cloudinary'
import { extractPublicId } from '@/lib/cloudinary'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

/**
 * POST /api/contracts/[contractId]/remove-signed
 *
 * Botón "Atrás" del candado 1 — desliga el LoanDocument firmado del
 * Contract y lo borra (hard delete del registro y del archivo en
 * Cloudinary). Sólo permitido si:
 *   - El préstamo está en IN_ACTIVATION
 *   - El candado 2 NO está cumplido (no hay Payment de comisión activo)
 *
 * Permisos: SUPER_ADMIN, COORDINADOR/GERENTE_ZONAL del préstamo.
 */
export async function POST(
  _req: NextRequest,
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
  if (!contract.loanDocumentFirmadoId) {
    return NextResponse.json({ error: 'El contrato no tiene documento firmado para remover' }, { status: 400 })
  }

  const loan = await prisma.loan.findFirst({
    where: { id: contract.loanId, companyId: companyId! },
    select: { id: true, estado: true, cobradorId: true, branchId: true },
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
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  if (loan.estado !== 'IN_ACTIVATION') {
    return NextResponse.json(
      { error: 'Solo se puede remover el contrato firmado durante la activación' },
      { status: 400 }
    )
  }

  // Validar candado 2: si ya hay Payment de comisión vigente, NO permitir
  // (se debe deshacer primero el pago con cancel-payment)
  const paymentVigente = await prisma.payment.count({
    where: {
      loanId: loan.id,
      scheduleId: null,
      canceledAt: null,
      OR: [
        { notas: { contains: 'apertura', mode: 'insensitive' } },
        { notas: { contains: 'seguro',   mode: 'insensitive' } },
        { notas: { contains: 'comisi',   mode: 'insensitive' } },
      ],
    },
  })
  if (paymentVigente > 0) {
    return NextResponse.json(
      { error: 'Primero deshaga el pago de comisión (candado 2) antes de remover el contrato firmado' },
      { status: 400 }
    )
  }

  // Cargar el LoanDocument para borrar archivo de Cloudinary
  const loanDoc = await prisma.loanDocument.findUnique({
    where: { id: contract.loanDocumentFirmadoId },
  })

  // Borrar de Cloudinary (best-effort: si falla, igual continúa con la DB)
  if (loanDoc) {
    try {
      const publicId = extractPublicId(loanDoc.archivoUrl)
      // El upload-signed sube como `raw` para PDFs, `image` para JPG/PNG.
      // Probamos primero raw, después image; cualquiera que sea el correcto borra.
      await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' }).catch(() => {})
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image' }).catch(() => {})
    } catch {
      // Ignorar — el archivo huérfano en Cloudinary no bloquea la operación
    }
  }

  // Persistir: desvincular del Contract y borrar el LoanDocument
  await prisma.$transaction(async (tx) => {
    await tx.contract.update({
      where: { id: contract.id },
      data: { loanDocumentFirmadoId: null },
    })
    if (loanDoc) {
      await tx.loanDocument.delete({ where: { id: loanDoc.id } }).catch(() => {})
    }
  })

  createAuditLog({
    userId,
    accion: 'REMOVE_SIGNED_CONTRACT',
    tabla: 'Contract',
    registroId: contract.id,
    valoresNuevos: {
      numeroContrato: contract.numeroContrato,
      loanDocumentRemoved: contract.loanDocumentFirmadoId,
    },
  })

  return NextResponse.json({ ok: true })
}
