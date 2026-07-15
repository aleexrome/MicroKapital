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

export interface OpcionesMora {
  multa: MoraDeteccion | null
  mora: MoraDeteccion | null
}

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
 * Devuelve las opciones de recargo aplicables — el coordinador escoge
 * cuál cobrar. Reglas por fecha calendario CDMX:
 *   - Antes del día de vencimiento → ninguna.
 *   - Mismo día antes de 14:00 CDMX → ninguna.
 *   - Mismo día ≥ 14:00 CDMX → solo MULTA ($200).
 *   - Día(s) posterior(es) → MULTA ($200) o MORA ($500), a discreción.
 * Solo una puede cobrarse por schedule.
 */
export function opcionesMora(
  fechaVencimiento: Date,
  fechaPago: Date,
): OpcionesMora {
  const diaVencimiento = toMxYMD(fechaVencimiento)
  const diaPago = toMxYMD(fechaPago)

  if (diaPago < diaVencimiento) return { multa: null, mora: null }
  if (diaPago > diaVencimiento) {
    return {
      multa: { tipo: 'MULTA', monto: MULTA_MONTO },
      mora: { tipo: 'MORA', monto: MORA_MONTO },
    }
  }
  const h = horaCdmx(fechaPago)
  if (h >= HORA_LIMITE_CDMX) {
    return { multa: { tipo: 'MULTA', monto: MULTA_MONTO }, mora: null }
  }
  return { multa: null, mora: null }
}

/**
 * Compat: para el auto-registro cuando se aplica/paga un schedule sin
 * elección explícita, devuelve la opción por defecto — MORA si aplica
 * (día posterior) y MULTA solo si es la única opción (mismo día tarde).
 * Mantiene el comportamiento previo del detector.
 */
export function detectarMora(
  fechaVencimiento: Date,
  fechaPago: Date,
): MoraDeteccion | null {
  const op = opcionesMora(fechaVencimiento, fechaPago)
  if (op.mora) return op.mora
  if (op.multa) return op.multa
  return null
}

/** Devuelve la opción para un tipo dado si aplica en este momento, sino null. */
export function opcionParaTipo(
  op: OpcionesMora,
  tipo: MoraTipo,
): MoraDeteccion | null {
  if (tipo === 'MULTA') return op.multa
  return op.mora
}

export function labelMora(tipo: MoraTipo): string {
  return tipo === 'MULTA' ? 'Multa' : 'Mora'
}
