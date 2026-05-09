import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { tienePrestamosEnLimbo72h } from '@/lib/limbo-status'

/**
 * GET /api/limbo-status
 *
 * Retorna el estado de bloqueo por limbo del usuario autenticado. Lo usa:
 *   - Banner rojo en dashboard de cobradora
 *   - Tooltip de botones "Nueva solicitud" / "Renovación anticipada"
 *   - Otros lugares que necesiten saber si la cobradora está bloqueada
 */
export async function GET(_req: NextRequest) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { id: userId } = session.user

  const status = await tienePrestamosEnLimbo72h(userId, prisma)
  return NextResponse.json(status)
}
