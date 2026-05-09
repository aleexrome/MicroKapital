import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'

/**
 * Cron horario que detecta préstamos APPROVED/IN_ACTIVATION estancados
 * (en limbo) y dispara notificaciones escalonadas a la cobradora, GZ del
 * branch, y todos los DG/DC de la company.
 *
 * Umbrales (horas desde aprobadoAt):
 *   12h, 24h, 36h, 48h, 60h, 72h
 *
 * - 72h marca la notificación como `esCritica` y bloquea a la cobradora
 *   para crear nuevas solicitudes/renovaciones (vía /lib/limbo-status).
 * - Notificaciones <72h expiran a los 15 días para no ensuciar bandejas.
 *
 * Idempotente: el unique (loanId, tipoNotificacion) en NotificacionLimbo
 * evita doble envío. Si el cron corre 60 veces en 1h, solo el primer
 * disparo crea registros; los siguientes hacen nada.
 *
 * Vercel Cron invoca GET con header Authorization Bearer = CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  const thresholds: Array<{ hours: number; tipo: string }> = [
    { hours: 12, tipo: '12h' },
    { hours: 24, tipo: '24h' },
    { hours: 36, tipo: '36h' },
    { hours: 48, tipo: '48h' },
    { hours: 60, tipo: '60h' },
    { hours: 72, tipo: '72h' },
  ]

  const loans = await prisma.loan.findMany({
    where: {
      estado: { in: ['APPROVED', 'IN_ACTIVATION'] },
      aprobadoAt: { not: null },
    },
    select: {
      id: true,
      companyId: true,
      branchId: true,
      cobradorId: true,
      aprobadoAt: true,
      capital: true,
      client: { select: { nombreCompleto: true } },
    },
  })

  // Cache de destinatarios por (companyId, branchId) para no requery por loan
  const destinatariosCache = new Map<string, string[]>()

  async function getDestinatarios(companyId: string, branchId: string, cobradorId: string): Promise<string[]> {
    const key = `${companyId}:${branchId}`
    let baseIds = destinatariosCache.get(key)
    if (!baseIds) {
      const dgsDcs = await prisma.user.findMany({
        where: {
          companyId,
          activo: true,
          rol: { in: ['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL'] },
        },
        select: { id: true },
      })
      // GZ con esa branchId en su zonaBranchIds (JSON array de strings).
      // Prisma no soporta filtro JSON contains de forma portable, así
      // que traemos todos los GZ activos y filtramos en JS.
      const allGZ = await prisma.user.findMany({
        where: {
          companyId,
          activo: true,
          rol: 'GERENTE_ZONAL',
        },
        select: { id: true, zonaBranchIds: true },
      })
      const gzMatch = allGZ.filter((u) => {
        const zones = Array.isArray(u.zonaBranchIds) ? (u.zonaBranchIds as string[]) : []
        return zones.includes(branchId)
      })
      baseIds = [...dgsDcs.map((u) => u.id), ...gzMatch.map((u) => u.id)]
      destinatariosCache.set(key, baseIds)
    }
    // Cobrador siempre incluido (puede no estar en los demás roles)
    return Array.from(new Set([...baseIds, cobradorId]))
  }

  const enviados: Array<{ loanId: string; tipo: string; destinatarios: number }> = []
  const errores: Array<{ loanId: string; tipo: string; error: string }> = []
  const expiraAtNoCritica = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000)

  for (const loan of loans) {
    if (!loan.aprobadoAt) continue
    const horas = (now.getTime() - loan.aprobadoAt.getTime()) / (1000 * 60 * 60)

    for (const t of thresholds) {
      if (horas < t.hours) continue

      // Idempotencia: el @@unique(loanId, tipoNotificacion) lanza P2002 si
      // ya existe — preferimos chequear antes para evitar el error.
      const yaEnviada = await prisma.notificacionLimbo.findUnique({
        where: { loanId_tipoNotificacion: { loanId: loan.id, tipoNotificacion: t.tipo } },
        select: { id: true },
      })
      if (yaEnviada) continue

      try {
        const destinatariosIds = await getDestinatarios(loan.companyId, loan.branchId, loan.cobradorId)
        const esCritica = t.tipo === '72h'
        const tituloBase = esCritica
          ? `🔴 CRÍTICO — préstamo en limbo > 72h`
          : `⚠️ Préstamo en limbo (${t.tipo})`
        const mensajeBase = `Cliente: ${loan.client.nombreCompleto}. Capital: $${Number(loan.capital).toFixed(2)}. Aprobado hace ${Math.round(horas)}h sin completar activación.`

        await prisma.$transaction(async (tx) => {
          await tx.notificacionLimbo.create({
            data: {
              loanId: loan.id,
              tipoNotificacion: t.tipo,
              destinatariosIds,
            },
          })
          await tx.notification.createMany({
            data: destinatariosIds.map((userId) => ({
              companyId: loan.companyId,
              userId,
              loanId: loan.id,
              tipo: `LIMBO_${t.tipo.toUpperCase()}`,
              titulo: tituloBase,
              mensaje: mensajeBase,
              esCritica,
              expiraAt: esCritica ? null : expiraAtNoCritica,
            })),
          })
        })

        createAuditLog({
          userId: 'SYSTEM',
          accion: 'CRON_LIMBO_NOTIFICACION',
          tabla: 'Loan',
          registroId: loan.id,
          valoresNuevos: {
            tipoNotificacion: t.tipo,
            horas: Math.round(horas),
            destinatarios: destinatariosIds.length,
            esCritica,
          },
        })

        enviados.push({ loanId: loan.id, tipo: t.tipo, destinatarios: destinatariosIds.length })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error('[cron limbo] error en loan', loan.id, t.tipo, msg)
        errores.push({ loanId: loan.id, tipo: t.tipo, error: msg })
      }
    }
  }

  return NextResponse.json({
    timestamp: now.toISOString(),
    loansEvaluados: loans.length,
    notificacionesEnviadas: enviados.length,
    enviados,
    errores,
  })
}
// trigger redeploy: limbo sub-fases A+B
