import type { PrismaClient } from '@prisma/client'

export interface LoanEnLimbo {
  id: string
  estado: string
  capital: number
  horasEnLimbo: number
  clienteNombre: string
}

/**
 * Determina si un usuario (típicamente cobradora) tiene préstamos en
 * limbo > 72h y está bloqueado para crear nuevas solicitudes / renovaciones.
 *
 * Un préstamo "en limbo" es:
 *   - estado IN [APPROVED, IN_ACTIVATION]
 *   - aprobadoAt no nulo
 *   - horas transcurridas desde aprobadoAt > 72
 *
 * Solo cuenta préstamos donde `cobradorId === userId`. Los DG/GZ no
 * heredan el bloqueo de sus subordinados — el bloqueo es individual.
 *
 * Si hay solicitud de cancelación PENDIENTE o APROBADA, ese préstamo NO
 * cuenta como bloqueante (el cobrador ya hizo su parte y está esperando
 * autorización o ya se resolvió).
 */
export async function tienePrestamosEnLimbo72h(
  userId: string,
  prismaClient: PrismaClient
): Promise<{ bloqueado: boolean; prestamosEnLimbo: LoanEnLimbo[] }> {
  const ahora = Date.now()
  const cutoff72h = new Date(ahora - 72 * 60 * 60 * 1000)

  const loans = await prismaClient.loan.findMany({
    where: {
      cobradorId: userId,
      estado: { in: ['APPROVED', 'IN_ACTIVATION'] },
      aprobadoAt: { not: null, lte: cutoff72h },
      // Excluir los que ya tienen solicitud de cancelación PENDIENTE o APROBADA.
      // Si fue RECHAZADA, el préstamo sí sigue contando como en limbo.
      solicitudCancelacionLimbo: {
        is: null,
      },
    },
    select: {
      id: true,
      estado: true,
      capital: true,
      aprobadoAt: true,
      client: { select: { nombreCompleto: true } },
    },
  })

  // Re-traer los que sí tienen solicitud para excluir solo PENDIENTE/APROBADA
  const conSolicitud = await prismaClient.loan.findMany({
    where: {
      cobradorId: userId,
      estado: { in: ['APPROVED', 'IN_ACTIVATION'] },
      aprobadoAt: { not: null, lte: cutoff72h },
      solicitudCancelacionLimbo: { isNot: null },
    },
    select: {
      id: true,
      estado: true,
      capital: true,
      aprobadoAt: true,
      client: { select: { nombreCompleto: true } },
      solicitudCancelacionLimbo: { select: { estado: true } },
    },
  })
  const conSolicitudActiva = conSolicitud.filter(
    (l) => l.solicitudCancelacionLimbo?.estado === 'RECHAZADA'
  )

  const todos = [...loans, ...conSolicitudActiva]
  const prestamosEnLimbo: LoanEnLimbo[] = todos.map((l) => ({
    id: l.id,
    estado: l.estado,
    capital: Number(l.capital),
    horasEnLimbo: l.aprobadoAt
      ? Math.round((ahora - l.aprobadoAt.getTime()) / (1000 * 60 * 60))
      : 0,
    clienteNombre: l.client.nombreCompleto,
  }))

  return {
    bloqueado: prestamosEnLimbo.length > 0,
    prestamosEnLimbo,
  }
}
