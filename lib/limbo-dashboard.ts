import type { PrismaClient } from '@prisma/client'

export interface LimboBuckets {
  recientes:   { count: number; totalCapital: number }  // < 12h
  demorados:   { count: number; totalCapital: number }  // 12–48h
  atrasados:   { count: number; totalCapital: number }  // 48–72h
  criticos:    { count: number; totalCapital: number }  // > 72h
}

export interface PrestamoEnLimboDetalle {
  id: string
  estado: string
  capital: number
  horas: number
  bucket: 'recientes' | 'demorados' | 'atrasados' | 'criticos'
  clienteNombre: string
  cobradorNombre: string
  branchNombre: string
}

export interface CobradoraBloqueada {
  cobradorId: string
  cobradorNombre: string
  branchNombre: string | null
  prestamosCount: number
}

/**
 * Agrupa préstamos APPROVED/IN_ACTIVATION por antigüedad desde aprobadoAt.
 *
 * Buckets:
 *   - 🟢 recientes (< 12h)
 *   - 🟡 demorados (12–48h)
 *   - 🔴 atrasados (48–72h)
 *   - ⛔ críticos (> 72h)
 *
 * Solo cuenta préstamos con `aprobadoAt` no nulo (ya aprobados, esperando
 * activación). Excluye los que ya tienen solicitud de cancelación
 * APROBADA o PENDIENTE — esos están "en proceso" y no inflan el limbo.
 *
 * `companyId` requerido. Para SUPER_ADMIN puede pasarse `null` para
 * traer cross-company (no usado por DG/DC normales).
 */
export async function getLimboData(
  prismaClient: PrismaClient,
  companyId: string
): Promise<{
  buckets: LimboBuckets
  detalle: PrestamoEnLimboDetalle[]
  cobradorasBloqueadas: CobradoraBloqueada[]
}> {
  const ahora = Date.now()

  // Traer TODOS los préstamos APPROVED/IN_ACTIVATION con aprobadoAt y, por
  // separado, las solicitudes de cancelación de esos préstamos. Filtramos en
  // JS los que tienen solicitud PENDIENTE o APROBADA (ya en proceso) — quedan
  // solo los que requieren acción real. Evitamos filtros de relación one-to-one
  // en el `where` de Prisma (que dan quirks).
  const todosLosLoans = await prismaClient.loan.findMany({
    where: {
      companyId,
      estado: { in: ['APPROVED', 'IN_ACTIVATION'] },
      aprobadoAt: { not: null },
    },
    select: {
      id: true,
      estado: true,
      capital: true,
      cobradorId: true,
      aprobadoAt: true,
      client: { select: { nombreCompleto: true } },
      cobrador: { select: { nombre: true } },
      branch: { select: { nombre: true } },
    },
  })

  const solicitudes = await prismaClient.solicitudCancelacionLimbo.findMany({
    where: { loanId: { in: todosLosLoans.map((l) => l.id) } },
    select: { loanId: true, estado: true },
  })
  const solicitudPorLoan = new Map(solicitudes.map((s) => [s.loanId, s.estado]))

  const loans = todosLosLoans.filter((l) => {
    const estadoSol = solicitudPorLoan.get(l.id)
    // Excluir los que tienen solicitud PENDIENTE o APROBADA. Si fue RECHAZADA
    // o no hay solicitud, el préstamo sí cuenta como en limbo.
    return estadoSol !== 'PENDIENTE' && estadoSol !== 'APROBADA'
  })

  const buckets: LimboBuckets = {
    recientes: { count: 0, totalCapital: 0 },
    demorados: { count: 0, totalCapital: 0 },
    atrasados: { count: 0, totalCapital: 0 },
    criticos:  { count: 0, totalCapital: 0 },
  }
  const detalle: PrestamoEnLimboDetalle[] = []
  const bloqueadasMap = new Map<string, CobradoraBloqueada>()

  for (const l of loans) {
    if (!l.aprobadoAt) continue
    const horas = (ahora - l.aprobadoAt.getTime()) / (1000 * 60 * 60)
    const cap = Number(l.capital)

    let bucket: PrestamoEnLimboDetalle['bucket']
    if (horas < 12) bucket = 'recientes'
    else if (horas < 48) bucket = 'demorados'
    else if (horas < 72) bucket = 'atrasados'
    else bucket = 'criticos'

    buckets[bucket].count++
    buckets[bucket].totalCapital += cap

    detalle.push({
      id: l.id,
      estado: l.estado,
      capital: cap,
      horas: Math.round(horas),
      bucket,
      clienteNombre: l.client.nombreCompleto,
      cobradorNombre: l.cobrador.nombre,
      branchNombre: l.branch.nombre,
    })

    // Cobradoras con préstamos > 72h = bloqueadas
    if (bucket === 'criticos') {
      const existing = bloqueadasMap.get(l.cobradorId)
      if (existing) {
        existing.prestamosCount++
      } else {
        bloqueadasMap.set(l.cobradorId, {
          cobradorId: l.cobradorId,
          cobradorNombre: l.cobrador.nombre,
          branchNombre: l.branch.nombre,
          prestamosCount: 1,
        })
      }
    }
  }

  return {
    buckets,
    detalle: detalle.sort((a, b) => b.horas - a.horas),
    cobradorasBloqueadas: Array.from(bloqueadasMap.values()).sort(
      (a, b) => b.prestamosCount - a.prestamosCount
    ),
  }
}

/**
 * Lista de solicitudes de cancelación de limbo en estado PENDIENTE,
 * con info del préstamo y solicitante para mostrar en el widget de
 * decisión del DG.
 */
export async function getSolicitudesCancelacionPendientes(
  prismaClient: PrismaClient,
  companyId: string
) {
  return prismaClient.solicitudCancelacionLimbo.findMany({
    where: {
      estado: 'PENDIENTE',
      loan: { companyId },
    },
    select: {
      id: true,
      motivo: true,
      createdAt: true,
      loanId: true,
      loan: {
        select: {
          estado: true,
          capital: true,
          aprobadoAt: true,
          client: { select: { nombreCompleto: true } },
          cobrador: { select: { nombre: true } },
          branch: { select: { nombre: true } },
        },
      },
      solicitante: { select: { nombre: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
}
