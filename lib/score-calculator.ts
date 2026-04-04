import { ScoreEventType } from '@prisma/client'
import type { ScoreInfo } from '@/types'

const SCORE_CHANGES: Record<ScoreEventType, number> = {
  ON_TIME: 10,
  ADVANCE: 15,
  LOAN_COMPLETED: 25,
  LATE_1_7: -10,
  LATE_8_15: -20,
  LATE_16_PLUS: -40,
  DEFAULT: -60,
}

/**
 * Determina el tipo de evento de score basado en días de diferencia
 * diasDiferencia < 0 = pagó antes, > 0 = pagó tarde
 */
export function calcScoreEventType(diasDiferencia: number): ScoreEventType {
  if (diasDiferencia <= -3) return ScoreEventType.ADVANCE
  if (diasDiferencia <= 0) return ScoreEventType.ON_TIME
  if (diasDiferencia <= 7) return ScoreEventType.LATE_1_7
  if (diasDiferencia <= 15) return ScoreEventType.LATE_8_15
  return ScoreEventType.LATE_16_PLUS
}

/**
 * Calcula los días de diferencia entre la fecha de pago y la fecha de vencimiento
 * Positivo = tarde, Negativo = adelantado
 */
export function calcDiasDiferencia(fechaVencimiento: Date, fechaPago: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24
  const diff = fechaPago.getTime() - fechaVencimiento.getTime()
  return Math.round(diff / msPerDay)
}

/**
 * Obtiene el cambio de score para un tipo de evento
 */
export function getScoreChange(tipoEvento: ScoreEventType): number {
  return SCORE_CHANGES[tipoEvento]
}

/**
 * Aplica el cambio de score y clampea entre 0 y 1000
 */
export function aplicarCambioScore(scoreActual: number, cambio: number): number {
  return Math.max(0, Math.min(1000, scoreActual + cambio))
}

/**
 * Obtiene la información visual del score para UI
 */
export function getScoreInfo(score: number): ScoreInfo {
  if (score <= 200) {
    return { score, nivel: 'ALTO_RIESGO', label: 'Riesgo Alto', color: '#EF4444' }
  }
  if (score <= 400) {
    return { score, nivel: 'RIESGO_MEDIO', label: 'Riesgo Medio', color: '#F97316' }
  }
  if (score <= 600) {
    return { score, nivel: 'REGULAR', label: 'Historial Regular', color: '#EAB308' }
  }
  if (score <= 800) {
    return { score, nivel: 'BUEN_CLIENTE', label: 'Buen Cliente', color: '#22C55E' }
  }
  return { score, nivel: 'PREMIUM', label: 'Cliente Premium', color: '#8B5CF6' }
}
