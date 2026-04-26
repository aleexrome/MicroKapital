import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Cron diario para purgar clientes y grupos soft-deleted hace ≥14 días.
 *
 * Solo borra entidades sin dependencias financieras (sin loans / sin
 * payments). Si tiene historial de pagos lo dejamos soft-deleted para
 * siempre — borrarlo de raíz destruiría auditoría contable. Ese es el
 * tradeoff aceptado: borrado "como si no existiera" es la UX, pero la
 * BD conserva el historial cuando hay movimientos.
 *
 * Vercel Cron lo invoca a través de la config de `vercel.json`. Pasa
 * un header Authorization Bearer con `process.env.CRON_SECRET` para
 * evitar que cualquiera pegue la URL pública.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)

  // ── Clientes purgables: soft-deleted ≥14 días Y sin loans / payments ──
  const clientsToPurge = await prisma.client.findMany({
    where: {
      eliminadoEn: { lte: cutoff },
      loans:    { none: {} },
      payments: { none: {} },
    },
    select: { id: true, nombreCompleto: true },
  })

  let clientsPurged = 0
  let clientsSkipped = 0
  for (const c of clientsToPurge) {
    try {
      await prisma.$transaction([
        prisma.clientDocument.deleteMany({ where: { clientId: c.id } }),
        prisma.scoreEvent.deleteMany({ where: { clientId: c.id } }),
        prisma.client.delete({ where: { id: c.id } }),
      ])
      clientsPurged++
    } catch (e) {
      // Probablemente quedó alguna dependencia que no anticipamos
      // (ej. ClientUser link). Log y seguimos.
      console.error('Purge client failed', c.id, c.nombreCompleto, e)
      clientsSkipped++
    }
  }

  // ── Grupos purgables: soft-deleted ≥14 días Y sin loans ──
  const groupsToPurge = await prisma.loanGroup.findMany({
    where: {
      eliminadoEn: { lte: cutoff },
      loans: { none: {} },
    },
    select: { id: true, nombre: true },
  })

  let groupsPurged = 0
  let groupsSkipped = 0
  for (const g of groupsToPurge) {
    try {
      await prisma.loanGroup.delete({ where: { id: g.id } })
      groupsPurged++
    } catch (e) {
      console.error('Purge group failed', g.id, g.nombre, e)
      groupsSkipped++
    }
  }

  // Diagnóstico: cuántos quedan soft-deleted con dependencias (no
  // purgables sin intervención humana).
  const stuckClients = await prisma.client.count({
    where: {
      eliminadoEn: { lte: cutoff },
      OR: [{ loans: { some: {} } }, { payments: { some: {} } }],
    },
  })
  const stuckGroups = await prisma.loanGroup.count({
    where: {
      eliminadoEn: { lte: cutoff },
      loans: { some: {} },
    },
  })

  return NextResponse.json({
    cutoff: cutoff.toISOString(),
    clientsPurged,
    clientsSkipped,
    groupsPurged,
    groupsSkipped,
    stuckClients,
    stuckGroups,
  })
}
