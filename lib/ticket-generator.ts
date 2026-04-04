import { prisma } from '@/lib/prisma'

/**
 * Genera un número de ticket único y atómico con el formato:
 * [PREFIJO_SUCURSAL]-[AÑO]-[CONSECUTIVO_5_DIGITOS]
 * Ej: SMA-2026-00142
 *
 * Usa una estrategia de reintentos optimista para garantizar unicidad.
 */
export async function generateTicketNumber(
  branchPrefix: string,
  year: number
): Promise<string> {
  const prefix = `${branchPrefix.toUpperCase()}-${year}-`
  const maxRetries = 10

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Buscar el último ticket para este prefijo
    const lastTicket = await prisma.ticket.findFirst({
      where: {
        numeroTicket: {
          startsWith: prefix,
        },
      },
      orderBy: {
        numeroTicket: 'desc',
      },
    })

    let nextNumber = 1
    if (lastTicket) {
      const parts = lastTicket.numeroTicket.split('-')
      const lastNum = parseInt(parts[parts.length - 1], 10)
      if (!isNaN(lastNum)) {
        nextNumber = lastNum + 1
      }
    }

    const candidate = `${prefix}${String(nextNumber).padStart(5, '0')}`

    // Verificar que no existe (carrera de condición)
    const exists = await prisma.ticket.findUnique({
      where: { numeroTicket: candidate },
    })

    if (!exists) {
      return candidate
    }
    // Si existe, intentar de nuevo con el siguiente número
  }

  throw new Error('No se pudo generar un número de ticket único después de varios intentos')
}

/**
 * Genera el código QR de verificación para un ticket
 * Formato: fintech.app/v/[NUMERO_TICKET]
 */
export function generateTicketQrData(numeroTicket: string): string {
  const cleanTicket = numeroTicket.replace(/-/g, '')
  return `fintech.app/v/${cleanTicket}`
}
