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

const schema = z.object({
  decision: z.enum(['APROBADA', 'RECHAZADA']),
  comentario: z.string().trim().min(3, 'Comentario requerido'),
})

/**
 * POST /api/loans/[id]/decidir-cancelacion-limbo
 *
 * DG, DC, GZ del branch (o SUPER_ADMIN) aprueba o rechaza una solicitud
 * de cancelación de préstamo en limbo. Si aprueba:
 *   - Préstamo APPROVED → vuelve a PENDING_APPROVAL? No, va directo a
 *     DECLINED (se cancela del todo).
 *   - Préstamo IN_ACTIVATION → ejecuta la lógica completa de
 *     cancel-activation (borrar contrato firmado, soft-cancelar Payment,
 *     limpiar caja, marcar DECLINED).
 *
 * Si rechaza: solo registra la decisión y notifica al solicitante.
 *
 * Notifica resultado a la cobradora (solicitante).
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

  // Solo DG/DC/GZ/SUPER_ADMIN pueden decidir
  if (rol !== 'SUPER_ADMIN' && rol !== 'DIRECTOR_GENERAL' && rol !== 'DIRECTOR_COMERCIAL' && rol !== 'GERENTE_ZONAL') {
    return NextResponse.json({ error: 'Sin permisos para decidir cancelaciones' }, { status: 403 })
  }

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

  // GZ solo puede decidir sobre branches de su zona
  if (rol === 'GERENTE_ZONAL') {
    const zoneIds = Array.isArray(zonaBranchIds) ? zonaBranchIds : []
    if (!zoneIds.includes(loan.branchId)) {
      return NextResponse.json({ error: 'Sin permisos sobre este branch' }, { status: 403 })
    }
  }

  const solicitud = await prisma.solicitudCancelacionLimbo.findUnique({
    where: { loanId: loan.id },
  })
  if (!solicitud) {
    return NextResponse.json({ error: 'No hay solicitud de cancelación para este préstamo' }, { status: 404 })
  }
  if (solicitud.estado !== 'PENDIENTE') {
    return NextResponse.json({ error: `La solicitud ya fue ${solicitud.estado.toLowerCase()}` }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  }
  const { decision, comentario } = parsed.data

  const now = new Date()
  const expiraAt = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000)

  // ── RECHAZADA — solo registrar decisión y notificar al solicitante ─────
  if (decision === 'RECHAZADA') {
    await prisma.solicitudCancelacionLimbo.update({
      where: { id: solicitud.id },
      data: {
        estado: 'RECHAZADA',
        aprobadoPor: userId,
        decididoAt: now,
        comentarioDecision: comentario,
      },
    })
    await prisma.notification.create({
      data: {
        companyId: loan.companyId,
        userId: solicitud.solicitadoPor,
        loanId: loan.id,
        tipo: 'LIMBO_SOLICITUD_RECHAZADA',
        titulo: 'Solicitud de cancelación rechazada',
        mensaje: `Cliente: ${loan.client.nombreCompleto}. Comentario: ${comentario}`,
        esCritica: false,
        expiraAt,
      },
    })
    createAuditLog({
      userId,
      accion: 'DECIDIR_CANCELACION_LIMBO',
      tabla: 'Loan',
      registroId: loan.id,
      valoresNuevos: { decision: 'RECHAZADA', comentario, solicitudId: solicitud.id },
    })
    return NextResponse.json({ ok: true, decision: 'RECHAZADA', message: 'Solicitud rechazada' })
  }

  // ── APROBADA — ejecutar cancelación completa según estado ──────────────
  if (loan.estado !== 'APPROVED' && loan.estado !== 'IN_ACTIVATION') {
    return NextResponse.json(
      { error: `El préstamo ya no está en limbo (estado actual: ${loan.estado}). Cierra la solicitud manualmente.` },
      { status: 400 }
    )
  }

  // Para IN_ACTIVATION con foto subida, no tocamos — el préstamo ya es ACTIVE de hecho
  if (loan.estado === 'IN_ACTIVATION' && loan.desembolsoFotoUrl) {
    return NextResponse.json(
      { error: 'No se puede cancelar: la foto de desembolso ya fue subida' },
      { status: 400 }
    )
  }

  // Localizar contrato firmado y Payment de comisión (mismo flow que cancel-activation)
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

  if (signedDoc) {
    try {
      const publicId = extractPublicId(signedDoc.archivoUrl)
      await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' }).catch(() => {})
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image' }).catch(() => {})
    } catch {
      // ignorar
    }
  }

  const fechaCaja = todayMx()

  await prisma.$transaction(async (tx) => {
    // Borrar contrato firmado si existe
    if (contractWithSigned) {
      await tx.contract.update({
        where: { id: contractWithSigned.id },
        data: { loanDocumentFirmadoId: null },
      })
      if (signedDoc) {
        await tx.loanDocument.delete({ where: { id: signedDoc.id } }).catch(() => {})
      }
    }

    // Cancelar Payment si existe
    if (payment) {
      await tx.payment.update({ where: { id: payment.id }, data: { canceledAt: now } })
      if (paymentTicket) {
        await tx.ticket.update({
          where: { id: paymentTicket.id },
          data: { anulado: true, razonAnulacion: 'Cancelación autorizada por limbo' },
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

    // Marcar el préstamo como DECLINED
    await tx.loan.update({
      where: { id: loan.id },
      data: {
        estado: 'DECLINED',
        activationCanceledAt: now,
        activationCanceledBy: userId,
        activationCancelReason: `Cancelación autorizada por limbo: ${comentario}`,
        seguro: null,
        seguroMetodoPago: null,
        seguroPendiente: false,
      },
    })

    // Marcar solicitud como APROBADA
    await tx.solicitudCancelacionLimbo.update({
      where: { id: solicitud.id },
      data: {
        estado: 'APROBADA',
        aprobadoPor: userId,
        decididoAt: now,
        comentarioDecision: comentario,
      },
    })
  })

  // Notificar al solicitante (cobrador) que aprobamos su solicitud
  try {
    await prisma.notification.create({
      data: {
        companyId: loan.companyId,
        userId: solicitud.solicitadoPor,
        loanId: loan.id,
        tipo: 'LIMBO_SOLICITUD_APROBADA',
        titulo: 'Solicitud de cancelación aprobada',
        mensaje: `Cliente: ${loan.client.nombreCompleto}. Comentario: ${comentario}`,
        esCritica: false,
        expiraAt,
      },
    })
  } catch (e) {
    console.error('[decidir-cancelacion-limbo] notif solicitante failed:', e)
  }

  // Notificar a GZ + DG/DC sobre la cancelación efectiva
  try {
    await notificarCancelacionLimbo(prisma, {
      loan,
      motivo: comentario,
      canceladoPorUserId: userId,
      accion: 'SOLICITUD_APROBADA',
    })
  } catch (e) {
    console.error('[decidir-cancelacion-limbo] notificarCancelacionLimbo failed:', e)
  }

  createAuditLog({
    userId,
    accion: 'DECIDIR_CANCELACION_LIMBO',
    tabla: 'Loan',
    registroId: loan.id,
    valoresNuevos: {
      decision: 'APROBADA',
      comentario,
      solicitudId: solicitud.id,
      contractRemoved: contractWithSigned?.id ?? null,
      paymentCanceled: payment?.id ?? null,
    },
  })

  return NextResponse.json({
    ok: true,
    decision: 'APROBADA',
    message: 'Solicitud aprobada — préstamo cancelado',
  })
}
