import { MX_TZ, toMxYMD } from '@/lib/timezone'

export const MULTA_MONTO = 200
export const MORA_MONTO = 500
/** Hora límite CDMX del día del pago. Después de esta hora, mismo día → multa. */
export const HORA_LIMITE_CDMX = 14

export type MoraTipo = 'MULTA' | 'MORA'

export interface MoraDeteccion {
  tipo: MoraTipo
  monto: number
}

/**
 * Devuelve la hora local CDMX de un Date sin importar el TZ del servidor.
 * Usa Intl para robustez — nada de restar 6 horas manualmente.
 */
function horaCdmx(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MX_TZ,
    hour: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const hh = parts.find((p) => p.type === 'hour')?.value ?? '00'
  return parseInt(hh, 10)
}

/**
 * Detecta si un pago cae en multa o mora. La regla:
 *   - Si `fechaPago` es el MISMO día calendario CDMX que la fecha de
 *     vencimiento y la hora CDMX del pago > 14:00 → MULTA ($200).
 *   - Si `fechaPago` es un día calendario CDMX POSTERIOR al vencimiento
 *     → MORA ($500).
 *   - En cualquier otro caso (pago temprano el día del vencimiento, o
 *     antes del día del vencimiento) → null (sin cargo).
 *
 * Todo el cálculo se hace en base a fechas calendario CDMX — no importa
 * si el servidor corre en UTC. El "día del pago" se saca con toMxYMD.
 */
export function detectarMora(
  fechaVencimiento: Date,
  fechaPago: Date,
): MoraDeteccion | null {
  const diaVencimiento = toMxYMD(fechaVencimiento)
  const diaPago = toMxYMD(fechaPago)

  if (diaPago < diaVencimiento) return null
  if (diaPago > diaVencimiento) return { tipo: 'MORA', monto: MORA_MONTO }

  // Mismo día — se convierte en MULTA solo si el pago se hizo después
  // de las 14:00 CDMX. Estrictamente > 14 significa "14:01 en adelante".
  const h = horaCdmx(fechaPago)
  if (h >= HORA_LIMITE_CDMX) return { tipo: 'MULTA', monto: MULTA_MONTO }
  return null
}

/** Label legible para UI/reportes. */
export function labelMora(tipo: MoraTipo): string {
  return tipo === 'MULTA' ? 'Multa' : 'Mora'
}
