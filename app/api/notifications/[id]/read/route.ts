import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/notifications/[id]/read
 *
 * Marca una notificación específica como leída. Las notificaciones
 * críticas (`esCritica: true`) NO pueden marcarse como leídas — el
 * sistema mantiene la alerta visible hasta que la condición subyacente
 * se resuelva. Este endpoint las rechaza con 400.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { id: userId } = session.user

  const notif = await prisma.notification.findUnique({
    where: { id: params.id },
    select: { id: true, userId: true, esCritica: true, leidaAt: true },
  })
  if (!notif || notif.userId !== userId) {
    return NextResponse.json({ error: 'Notificación no encontrada' }, { status: 404 })
  }
  if (notif.esCritica) {
    return NextResponse.json(
      { error: 'Las notificaciones críticas no se pueden marcar como leídas' },
      { status: 400 }
    )
  }
  if (notif.leidaAt) {
    return NextResponse.json({ ok: true, alreadyRead: true })
  }

  await prisma.notification.update({
    where: { id: notif.id },
    data: { leidaAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}
