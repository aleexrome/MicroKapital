import type { LoanCalculation } from '@/types'

function roundTwo(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * SOLIDARIO — Grupo solidario
 * Plazo: 8 semanas, pago semanal
 * La tasa se obtiene de company_settings (clave: "tasa_solidario")
 */
export function calcSolidario(capital: number, tasaInteres: number): LoanCalculation {
  const plazo = 8
  const interes = roundTwo(capital * tasaInteres)
  const totalPago = roundTwo(capital + interes)
  const pagoSemanal = roundTwo(totalPago / plazo)

  return {
    capital,
    tasaInteres,
    comision: 0,
    montoReal: capital,
    interes,
    totalPago,
    pagoSemanal,
    plazo,
  }
}

/**
 * INDIVIDUAL — Crédito personal
 * Plazo: 12 semanas, pago semanal
 * Comisión fija del 17% descontada del capital al desembolso
 */
export function calcIndividual(capital: number, tasaInteres: number): LoanCalculation {
  const plazo = 12
  const comision = roundTwo(capital * 0.17)
  const montoReal = roundTwo(capital - comision)
  const interes = roundTwo(capital * tasaInteres)
  const totalPago = roundTwo(capital + interes)
  const pagoSemanal = roundTwo(totalPago / plazo)

  return {
    capital,
    tasaInteres,
    comision,
    montoReal,
    interes,
    totalPago,
    pagoSemanal,
    plazo,
  }
}

/**
 * AGIL — Cobranza ágil
 * Plazo: 24 días hábiles (lunes-viernes, sin festivos)
 * Ganancia fija del 56% sobre el capital
 */
export function calcAgil(capital: number): LoanCalculation {
  const plazo = 24
  const tasaInteres = 0.56
  const interes = roundTwo(capital * tasaInteres)
  const totalPago = roundTwo(capital + interes)
  const pagoDiario = roundTwo(totalPago / plazo)

  return {
    capital,
    tasaInteres,
    comision: 0,
    montoReal: capital,
    interes,
    totalPago,
    pagoDiario,
    plazo,
  }
}

/**
 * Calcula la fórmula correcta según el tipo de préstamo
 */
export function calcLoan(
  tipo: 'SOLIDARIO' | 'INDIVIDUAL' | 'AGIL',
  capital: number,
  tasaInteres?: number
): LoanCalculation {
  switch (tipo) {
    case 'SOLIDARIO':
      return calcSolidario(capital, tasaInteres ?? 0.4)
    case 'INDIVIDUAL':
      return calcIndividual(capital, tasaInteres ?? 0.3)
    case 'AGIL':
      return calcAgil(capital)
  }
}
