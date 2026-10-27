/**
 * Tareas de cron compartidas. Se extraen aquí para poder:
 *   1. Correrlas desde su propio endpoint cron (compat con la URL vieja
 *      de Vercel que ya está registrada).
 *   2. Encadenarlas desde otro cron, para esquivar el límite de 2
 *      cron jobs del plan Vercel Hobby.
 */

import { prisma } from '@/lib/prisma'

export interface PurgeResult {
  cutoff: string
  clientsPurged: number
  clientsSkipped: number
  groupsPurged: number
  groupsSkipped: number
  stuckClients: number
  stuckGroups: number
}

/**
 * Purga clientes y grupos soft-deleted hace ≥14 días sin dependencias
 * financieras (sin loans / sin payments). Mismo cuerpo que vivía en
 * /api/cron/purge-deleted — ahora extraído para poder encadenarse.
 */
export async function purgeDeletedTask(): Promise<PurgeResult> {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)

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
      console.error('Purge client failed', c.id, c.nombreCompleto, e)
      clientsSkipped++
    }
  }

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

  return {
    cutoff: cutoff.toISOString(),
    clientsPurged,
    clientsSkipped,
    groupsPurged,
    groupsSkipped,
    stuckClients,
    stuckGroups,
  }
}
