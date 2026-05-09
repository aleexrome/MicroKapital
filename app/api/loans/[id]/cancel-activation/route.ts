import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { createAuditLog } from '@/lib/audit'
import { v2 as cloudinary } from 'cloudinary'
import { extractPublicId } from '@/lib/cloudinary'
import { todayMx } from '@/lib/timezone'
import { notificarCancelacionLimbo } from '@/lib/limbo-notifications'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const cancelSchema = z.object({
  reason: z.string().trim().min(3, 'Razón requerida'),
})

/**
 * POST /api/loans/[id]/cancel-activation
 *
 * Cancela el flujo de activación EN CURSO. Cambia el préstamo a DECLINED,
 * deshace los efectos de los candados parcialmente cumplidos:
 *   - Si hay contrato firmado: lo borra (LoanDocument + Cloudinary)
 *   - Si hay Payment de comisión vigente: lo soft-cancela y revierte caja/ticket
 *
 * Reglas:
 *   - Préstamo en IN_ACTIVATION
 *   - Candado 3 NO cumplido (no se puede cancelar después de subir la foto —
 *     en ese punto el préstamo ya está ACTIVE)
 *
 * Permisos: SUPER_ADMIN, COORDINADOR/GERENTE_ZONAL del préstamo.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { rol, companyId, id: userId, zonaBranchIds } = session.user

  const loan = await prisma.loan.findFirst({
    where: { id: params.id, companyId: companyId! },
    select: {
      id: true, estado: true, cobradorId: true, branchId: true, companyId: true,
      desembolsoFotoUrl: true, capital: true,
      client: { select: { nombreCompleto: true } },
    },
  })
  if (!loan) {
    return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })
  }

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
      { error: 'Solo se puede cancelar la activación durante IN_ACTIVATION' },
      { status: 400 }
    )
  }

  if (loan.desembolsoFotoUrl) {
    return NextResponse.json(
      { error: 'No se puede cancelar: la foto de desembolso ya fue subida — el préstamo ya quedó activado' },
      { status: 400 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const parsed = cancelSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Razón requerida' }, { status: 400 })
  }
  const { reason } = parsed.data

  // ── 1. Localizar contrato firmado y Payment de comisión (si los hay) ─────
  const contractWithSigned = await prisma.contract.findFirst({
    where: {
      companyId: companyId!,
      loanDocumentFirmadoId: { not: null },
      OR: [
        { loanId: loan.id },
        { groupMembers: { some: { loanId: loan.id } } },
      ],
    },
    select: { id: true, loanDocumentFirmadoId: true, numeroContrato: true },
  })

  let signedDoc: { id: string; archivoUrl: string } | null = null
  if (contractWithSigned?.loanDocumentFirmadoId) {
    signedDoc = await prisma.loanDocument.findUnique({
      where: { id: contractWithSigned.loanDocumentFirmadoId },
      select: { id: true, archivoUrl: true },
    })
  }

  const payment = await prisma.payment.findFirst({
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
    include: { tickets: true },
    orderBy: { fechaHora: 'desc' },
  })
  const paymentTicket = payment?.tickets[0] ?? null

  // Borrar archivo de Cloudinary del contrato firmado (best-effort, fuera de tx)
  if (signedDoc) {
    try {
      const publicId = extractPublicId(signedDoc.archivoUrl)
      await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' }).catch(() => {})
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image' }).catch(() => {})
    } catch {
      // ignorar
    }
  }

  const now = new Date()
  const fechaCaja = todayMx()

  await prisma.$transaction(async (tx) => {
    // ── 2. Borrar contrato firmado si existe ───────────────────────────────
    if (contractWithSigned) {
      await tx.contract.update({
        where: { id: contractWithSigned.id },
        data: { loanDocumentFirmadoId: null },
      })
      if (signedDoc) {
        await tx.loanDocument.delete({ where: { id: signedDoc.id } }).catch(() => {})
      }
    }

    // ── 3. Cancelar Payment de comisión si existe ──────────────────────────
    if (payment) {
      await tx.payment.update({
        where: { id: payment.id },
        data: { canceledAt: now },
      })
      if (paymentTicket) {
        await tx.ticket.update({
          where: { id: paymentTicket.id },
          data: {
            anulado: true,
            razonAnulacion: 'Cancelación de activación',
          },
        })
      }
      if (payment.metodoPago === 'CASH' || payment.metodoPago === 'CARD') {
        const cobro = Number(payment.monto)
        const cambio = Number(payment.cambioEntregado)
        const reg = await tx.cashRegister.findUnique({
          where: { cobradorId_fecha: { cobradorId: payment.cobradorId, fecha: fechaCaja } },
        })
        if (reg) {
          await tx.cashRegister.update({
            where: { cobradorId_fecha: { cobradorId: payment.cobradorId, fecha: fechaCaja } },
            data: {
              cobradoEfectivo: payment.metodoPago === 'CASH' ? { decrement: cobro } : undefined,
              cobradoTarjeta:  payment.metodoPago === 'CARD' ? { decrement: cobro } : undefined,
              cambioEntregado: cambio > 0 ? { decrement: cambio } : undefined,
            },
          })
        }
      }
    }

    // ── 4. Marcar el préstamo como DECLINED ────────────────────────────────
    await tx.loan.update({
      where: { id: loan.id },
      data: {
        estado: 'DECLINED',
        activationCanceledAt: now,
        activationCanceledBy: userId,
        activationCancelReason: reason,
        // Limpiar campos de seguro
        seguro: null,
        seguroMetodoPago: null,
        seguroPendiente: false,
      },
    })
  })

  createAuditLog({
    userId,
    accion: 'CANCEL_ACTIVATION',
    tabla: 'Loan',
    registroId: loan.id,
    valoresNuevos: {
      reason,
      contractRemoved: contractWithSigned?.id ?? null,
      paymentCanceled: payment?.id ?? null,
    },
  })

  // Notificar a cobradora + GZ + DG/DC. Best-effort: si falla por algún motivo
  // (ej. usuario sin company válida) no rompemos la cancelación que ya se
  // ejecutó — solo loggeamos.
  try {
    await notificarCancelacionLimbo(prisma, {
      loan,
      motivo: reason,
      canceladoPorUserId: userId,
      accion: 'CANCEL_ACTIVATION',
    })
  } catch (e) {
    console.error('[cancel-activation] notificarCancelacionLimbo failed:', e)
  }

  return NextResponse.json({ ok: true, message: 'Activación cancelada' })
}
