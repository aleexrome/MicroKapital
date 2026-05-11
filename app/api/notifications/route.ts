import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/notifications
 *
 * Lista paginada de notificaciones del usuario autenticado.
 *
 * Query params:
 *   - limit  (default 50, max 200)
 *   - cursor (id de la última notificación de la página anterior — para keyset pagination)
 *   - filtro: 'todas' | 'no_leidas' | 'criticas' (default 'todas')
 *   - tipo:   filtro por prefix de tipo (ej. 'LIMBO_')
 *
 * Excluye automáticamente notificaciones expiradas (`expiraAt < now`).
 * Críticas (`esCritica: true`) nunca expiran (expiraAt = NULL).
 */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { id: userId, companyId } = session.user
  if (!companyId) {
    return NextResponse.json({ error: 'Compañía no resuelta' }, { status: 400 })
  }

  const { searchParams } = new URL(req.url)
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10) || 50))
  const cursor = searchParams.get('cursor')
  const filtro = searchParams.get('filtro') ?? 'todas'
  const tipoPrefix = searchParams.get('tipo')

  const now = new Date()

  const where: Record<string, unknown> = {
    userId,
    companyId,
    OR: [{ expiraAt: null }, { expiraAt: { gt: now } }],
  }
  if (filtro === 'no_leidas') {
    where.leidaAt = null
  } else if (filtro === 'criticas') {
    where.nivel = 'CRITICA'
  } else if (filtro === 'importantes') {
    where.nivel = 'IMPORTANTE'
  } else if (filtro === 'informativas') {
    where.nivel = 'INFORMATIVA'
  }
  if (tipoPrefix) {
    where.tipo = { startsWith: tipoPrefix }
  }

  const items = await prisma.notification.findMany({
    where,
    // Críticas primero, luego importantes, luego por fecha. (orden de
    // nivel se hace en cliente porque Prisma no ordena por string custom).
    orderBy: [{ esCritica: 'desc' }, { createdAt: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      tipo: true,
      titulo: true,
      mensaje: true,
      nivel: true,
      esCritica: true,
      linkUrl: true,
      leidaAt: true,
      expiraAt: true,
      createdAt: true,
      loanId: true,
      clientId: true,
    },
  })

  const hasMore = items.length > limit
  const data = hasMore ? items.slice(0, limit) : items

  // Conteos rápidos para badges
  const noExpiradas = { OR: [{ expiraAt: null }, { expiraAt: { gt: now } }] }
  const [noLeidasCount, criticasCount, importantesNoLeidas] = await Promise.all([
    prisma.notification.count({ where: { userId, companyId, leidaAt: null, ...noExpiradas } }),
    // críticas siempre cuentan (no se pueden marcar leídas)
    prisma.notification.count({ where: { userId, companyId, nivel: 'CRITICA', ...noExpiradas } }),
    prisma.notification.count({ where: { userId, companyId, nivel: 'IMPORTANTE', leidaAt: null, ...noExpiradas } }),
  ])

  return NextResponse.json({
    items: data,
    nextCursor: hasMore ? data[data.length - 1]?.id : null,
    noLeidasCount,
    criticasCount,
    importantesNoLeidas,
  })
}
