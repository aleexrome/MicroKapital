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

  // Antes se hacían 4 queries en Promise.all (findMany + 3 counts). Con
  // pgbouncer en transaction mode + connection_limit=1, Prisma envuelve
  // Promise.all en una transacción interactiva (BEGIN...COMMIT). Ese
  // BEGIN mismo agregaba 1-5s de latencia por round-trips.
  // Ahora: 2 queries secuenciales (sin BEGIN implícito):
  //   1. findMany para los items.
  //   2. $queryRaw que devuelve los 3 counts en UNA sola pasada con
  //      COUNT(*) FILTER. Postgres resuelve los 3 en un solo scan.
  const items = await prisma.notification.findMany({
    where,
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

  const countsRows = await prisma.$queryRaw<Array<{
    no_leidas: bigint
    criticas: bigint
    importantes_no_leidas: bigint
  }>>`
    SELECT
      COUNT(*) FILTER (WHERE "leidaAt" IS NULL)                                       AS no_leidas,
      COUNT(*) FILTER (WHERE "nivel" = 'CRITICA')                                     AS criticas,
      COUNT(*) FILTER (WHERE "nivel" = 'IMPORTANTE' AND "leidaAt" IS NULL)            AS importantes_no_leidas
    FROM "Notification"
    WHERE "userId" = ${userId}
      AND "companyId" = ${companyId}
      AND ("expiraAt" IS NULL OR "expiraAt" > ${now})
  `
  const noLeidasCount       = Number(countsRows[0]?.no_leidas ?? 0)
  const criticasCount       = Number(countsRows[0]?.criticas ?? 0)
  const importantesNoLeidas = Number(countsRows[0]?.importantes_no_leidas ?? 0)

  return NextResponse.json({
    items: data,
    nextCursor: hasMore ? data[data.length - 1]?.id : null,
    noLeidasCount,
    criticasCount,
    importantesNoLeidas,
  })
}
