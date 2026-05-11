import type { PrismaClient, Prisma } from '@prisma/client'

export type NivelNotificacion = 'CRITICA' | 'IMPORTANTE' | 'INFORMATIVA'

interface CrearNotificacionParams {
  /** companyId al que pertenecen las notificaciones (todas comparten company). */
  companyId: string
  /** IDs de Users destinatarios. Se deduplican automáticamente. Si está vacío, no hace nada. */
  destinatariosIds: string[]
  /** Tipo discriminador (ej. 'SOLICITUD_NUEVA', 'PRESTAMO_ACTIVADO', etc.) */
  tipo: string
  /** Clasificación visual. CRITICA fuerza esCritica=true y expiraAt=null. */
  nivel: NivelNotificacion
  /** Título corto que aparece en negrita en la campana. */
  titulo: string
  /** Cuerpo del mensaje. */
  mensaje: string
  /** Si se omite y hay loanId, se navega a /prestamos/<loanId>. */
  linkUrl?: string
  /** Préstamo asociado (para navegación por defecto y trazabilidad). */
  loanId?: string
  /** Cliente asociado (trazabilidad). */
  clientId?: string
  /** Días hasta expirar. Default 15. Ignorado si nivel === 'CRITICA' (no expira). */
  expiraEnDias?: number
}

/**
 * Helper centralizado para crear notificaciones de la app. Reemplaza el
 * patrón ad-hoc de hacer `prisma.notification.createMany(...)` en cada
 * endpoint, garantizando consistencia en:
 *   - Deduplicación de destinatarios
 *   - Manejo de nivel ↔ esCritica ↔ expiraAt
 *   - linkUrl por defecto desde loanId
 *
 * Acepta `prisma` o un `tx` de transacción para agrupar con otra lógica.
 *
 * NO lanza excepciones que rompan el flujo del caller — si algo falla,
 * loggea y retorna { creadas: 0 }. Las notificaciones son un efecto
 * colateral; no deben tumbar la operación principal.
 */
export async function crearNotificacion(
  client: PrismaClient | Prisma.TransactionClient,
  params: CrearNotificacionParams
): Promise<{ creadas: number }> {
  const {
    companyId,
    destinatariosIds,
    tipo,
    nivel,
    titulo,
    mensaje,
    linkUrl,
    loanId,
    clientId,
    expiraEnDias = 15,
  } = params

  const uniqueIds = Array.from(new Set(destinatariosIds.filter(Boolean)))
  if (uniqueIds.length === 0) return { creadas: 0 }

  const esCritica = nivel === 'CRITICA'
  const expiraAt = esCritica ? null : new Date(Date.now() + expiraEnDias * 24 * 60 * 60 * 1000)
  const finalLink = linkUrl ?? (loanId ? `/prestamos/${loanId}` : null)

  try {
    const result = await client.notification.createMany({
      data: uniqueIds.map((userId) => ({
        companyId,
        userId,
        loanId: loanId ?? null,
        clientId: clientId ?? null,
        tipo,
        titulo,
        mensaje,
        nivel,
        esCritica,
        linkUrl: finalLink,
        expiraAt,
      })),
    })
    return { creadas: result.count }
  } catch (e) {
    console.error('[crearNotificacion] failed:', tipo, e)
    return { creadas: 0 }
  }
}

// ── Helpers de resolución de destinatarios ──────────────────────────────────

/** IDs de todos los DG + DC activos de la company. */
export async function getDirectoresIds(
  client: PrismaClient | Prisma.TransactionClient,
  companyId: string
): Promise<string[]> {
  const users = await client.user.findMany({
    where: {
      companyId,
      activo: true,
      rol: { in: ['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL'] },
    },
    select: { id: true },
  })
  return users.map((u) => u.id)
}

/**
 * IDs de los GERENTE_ZONAL activos cuya zona (zonaBranchIds JSON) incluye
 * el branchId dado. Prisma no soporta filtro JSON contains portable, así
 * que filtramos en JS.
 */
export async function getGerentesZonalesIds(
  client: PrismaClient | Prisma.TransactionClient,
  companyId: string,
  branchId: string
): Promise<string[]> {
  const allGZ = await client.user.findMany({
    where: { companyId, activo: true, rol: 'GERENTE_ZONAL' },
    select: { id: true, zonaBranchIds: true },
  })
  return allGZ
    .filter((u) => {
      const zones = Array.isArray(u.zonaBranchIds) ? (u.zonaBranchIds as string[]) : []
      return zones.includes(branchId)
    })
    .map((u) => u.id)
}
