import { prisma } from '@/lib/prisma'

interface AuditLogParams {
  userId?: string | null
  accion: string
  tabla: string
  registroId?: string
  valoresAnteriores?: Record<string, unknown>
  valoresNuevos?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
}

/**
 * Registra una entrada en el log de auditoría.
 * Fire-and-forget: no bloquea el flujo principal.
 * Los errores se capturan silenciosamente para no afectar la operación principal.
 */
export function createAuditLog(params: AuditLogParams): void {
  prisma.auditLog
    .create({
      data: {
        userId: params.userId ?? null,
        accion: params.accion,
        tabla: params.tabla,
        registroId: params.registroId,
        valoresAnteriores: params.valoresAnteriores ? JSON.parse(JSON.stringify(params.valoresAnteriores)) : undefined,
        valoresNuevos: params.valoresNuevos ? JSON.parse(JSON.stringify(params.valoresNuevos)) : undefined,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    })
    .catch((err) => {
      console.error('[AuditLog] Error al registrar:', err)
    })
}

/**
 * Versión awaitable para casos donde se necesita garantizar el registro
 */
export async function createAuditLogAsync(params: AuditLogParams): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: params.userId ?? null,
      accion: params.accion,
      tabla: params.tabla,
      registroId: params.registroId,
      valoresAnteriores: params.valoresAnteriores ? JSON.parse(JSON.stringify(params.valoresAnteriores)) : undefined,
      valoresNuevos: params.valoresNuevos ? JSON.parse(JSON.stringify(params.valoresNuevos)) : undefined,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    },
  })
}
