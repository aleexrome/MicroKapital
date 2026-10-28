import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { crearNotificacion } from '@/lib/notifications'

/**
 * POST /api/payments/[id]/resolve-clarification
 *
 * El coordinador/cobrador responde la aclaración solicitada por el
 * verificador. Puede corregir el idTransferencia, la referenciaBanco
 * y/o subir un nuevo comprobante. Al responder, el pago vuelve a estar
 * "listo-para-verificar" y se notifica al verificador que lo pidió.
 *
 * Si el coord concluye que el pago no se hizo, debe cancelar el pago
 * por otra vía (no es responsabilidad de este endpoint).
 */
const schema = z.object({
  respuesta:          z.string().trim().min(5, 'Describe qué revisaste (mín. 5 caracteres)'),
  idTransferencia:    z.string().trim().optional(),
  referenciaBanco:    z.string().trim().optional(),
  comprobanteFotoUrl: z.string().url().optional(),
})

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  }

  const payment = await prisma.payment.findFirst({
    where: {
      id:                     params.id,
      metodoPago:             'TRANSFER',
      statusTransferencia:    'PENDIENTE',
      canceledAt:             null,
      aclaracionSolicitadaAt: { not: null },
      loan:                   { companyId: session.user.companyId! },
    },
    include: {
      client: { select: { nombreCompleto: true } },
    },
  })
  if (!payment) {
    return NextResponse.json({ error: 'Esta transferencia no tiene aclaración abierta' }, { status: 404 })
  }

  // Solo el cobrador que capturó el pago (o DG/DC/SA) puede responder.
  const rol = session.user.rol
  const esAdmin = rol === 'DIRECTOR_GENERAL' || rol === 'DIRECTOR_COMERCIAL' || rol === 'SUPER_ADMIN'
  if (!esAdmin && payment.cobradorId !== session.user.id) {
    return NextResponse.json({ error: 'Solo quien capturó el pago puede responder la aclaración' }, { status: 403 })
  }

  const now = new Date()
  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      aclaracionRespuesta:    parsed.data.respuesta,
      aclaracionRespondidaAt: now,
      ...(parsed.data.idTransferencia    ? { idTransferencia:    parsed.data.idTransferencia    } : {}),
      ...(parsed.data.referenciaBanco    ? { referenciaBanco:    parsed.data.referenciaBanco    } : {}),
      ...(parsed.data.comprobanteFotoUrl ? { comprobanteFotoUrl: parsed.data.comprobanteFotoUrl, comprobanteFotoAt: now } : {}),
    },
  })

  await createAuditLog({
    userId:        session.user.id,
    accion:        'RESPONDER_ACLARACION_TRANSFER',
    tabla:         'Payment',
    registroId:    payment.id,
    valoresNuevos: {
      respuesta:          parsed.data.respuesta,
      idTransferencia:    parsed.data.idTransferencia ?? null,
      referenciaBanco:    parsed.data.referenciaBanco ?? null,
      comprobanteFotoUrl: parsed.data.comprobanteFotoUrl ?? null,
    },
  })

  // Notificar al verificador que pidió la aclaración.
  if (payment.aclaracionSolicitadaPorId) {
    await crearNotificacion(prisma, {
      companyId:        session.user.companyId!,
      destinatariosIds: [payment.aclaracionSolicitadaPorId],
      tipo:             'TRANSFERENCIA_ACLARACION_RESPONDIDA',
      nivel:            'INFORMATIVA',
      titulo:           'Aclaración de transferencia respondida',
      mensaje:          `${payment.client.nombreCompleto} — $${Number(payment.monto).toFixed(2)}: ${parsed.data.respuesta}`,
      loanId:           payment.loanId,
      clientId:         payment.clientId,
      linkUrl:          '/transferencias',
    })
  }

  return NextResponse.json({ ok: true })
}
