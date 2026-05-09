import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/notifications/mark-all-read
 *
 * Marca como leídas TODAS las notificaciones no leídas y NO críticas del
 * usuario autenticado. Las críticas se omiten — el bloqueo se mantiene
 * hasta que la causa raíz se resuelva.
 *
 * También respeta `expiraAt`: notificaciones expiradas no se tocan
 * (ya están "fuera del flujo"; un cron futuro las podrá purgar).
 */
export async function POST(_req: NextRequest) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { id: userId, companyId } = session.user
  if (!companyId) {
    return NextResponse.json({ error: 'Compañía no resuelta' }, { status: 400 })
  }

  const now = new Date()

  const result = await prisma.notification.updateMany({
    where: {
      userId,
      companyId,
      leidaAt: null,
      esCritica: false,
      OR: [{ expiraAt: null }, { expiraAt: { gt: now } }],
    },
    data: { leidaAt: now },
  })

  return NextResponse.json({ ok: true, count: result.count })
}
