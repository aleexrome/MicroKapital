import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { canVerifyTransfer, type AccessUser } from '@/lib/access'
import { createAuditLog } from '@/lib/audit'
import { crearNotificacion } from '@/lib/notifications'

/**
 * POST /api/payments/[id]/request-clarification
 *
 * El verificador (GZ/DG/MC) no encontró el depósito en la cuenta y
 * pide al coord que aclare. Marca el Payment con los campos de
 * aclaración y notifica al cobrador.
 *
 * El Payment sigue en statusTransferencia='PENDIENTE' pero deja de
 * aparecer como "listo-para-verificar" hasta que el coord responda
 * (aclaracionRespondidaAt != null).
 */
const schema = z.object({
  nota: z.string().trim().min(5, 'La nota debe explicar el problema (mín. 5 caracteres)'),
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
      id:                  params.id,
      metodoPago:          'TRANSFER',
      statusTransferencia: 'PENDIENTE',
      canceledAt:          null,
      loan:                { companyId: session.user.companyId! },
    },
    include: {
      loan:   { include: { branch: { select: { id: true, nombre: true, verificacionCentralizada: true } } } },
      client: { select: { nombreCompleto: true } },
    },
  })
  if (!payment) {
    return NextResponse.json({ error: 'Transferencia no encontrada o ya verificada' }, { status: 404 })
  }

  const accessUser: AccessUser = {
    id:        session.user.id,
    rol:       session.user.rol,
    branchId:  session.user.branchId ?? null,
    zonaBranchIds: session.user.zonaBranchIds as string[] | null | undefined,
    permisoVerificarTransferBranchIds: session.user.permisoVerificarTransferBranchIds ?? null,
  }
  if (!canVerifyTransfer(accessUser, payment.loan.branch)) {
    return NextResponse.json({ error: 'Sin permiso para pedir aclaración en esta sucursal' }, { status: 403 })
  }

  const now = new Date()
  await prisma.payment.update({
    where: { id: payment.id },
    data:  {
      aclaracionSolicitadaAt:    now,
      aclaracionSolicitadaPorId: session.user.id,
      aclaracionNota:            parsed.data.nota,
      // Si antes había una respuesta, limpiamos para que vuelva a ser
      // "pendiente de respuesta" del coord.
      aclaracionRespondidaAt:    null,
      aclaracionRespuesta:       null,
    },
  })

  await createAuditLog({
    userId:        session.user.id,
    accion:        'SOLICITAR_ACLARACION_TRANSFER',
    tabla:         'Payment',
    registroId:    payment.id,
    valoresNuevos: { nota: parsed.data.nota },
  })

  // Notificar al cobrador que capturó el pago.
  await crearNotificacion(prisma, {
    companyId:        session.user.companyId!,
    destinatariosIds: [payment.cobradorId],
    tipo:             'TRANSFERENCIA_ACLARACION',
    nivel:            'IMPORTANTE',
    titulo:           'Transferencia requiere aclaración',
    mensaje:          `${payment.client.nombreCompleto} — $${Number(payment.monto).toFixed(2)}: ${parsed.data.nota}`,
    loanId:           payment.loanId,
    clientId:         payment.clientId,
    linkUrl:          '/transferencias',
  })

  return NextResponse.json({ ok: true })
}
