import type { LoanCalculation } from '@/types'

function roundTwo(n: number): number {
  return Math.round(n * 100) / 100
}

// ─── SOLIDARIO ───────────────────────────────────────────────────────────────
//
// Plazo: 8 semanas, pago semanal
// Tasa fija según tipo de grupo:
//   Grupo REGULAR:  $175 por cada mil = 0.175 sobre el capital
//   Grupo RESCATE:  $195 por cada mil = 0.195 sobre el capital
// Seguro de apertura (cobrar al cliente por separado, no sobre el capital):
//   Capital $2,000–$4,000  → $200
//   Capital $5,000–$9,000  → $250
//   Capital $10,000–$14,000 → $300
//   Capital $15,000–$19,000 → $350
// Validaciones: mín 4 integrantes, máx 5 · $2,000–$25,000 · edad 18–64 · solo mujeres

export function calcSeguroSolidario(capital: number): number {
  if (capital >= 2000 && capital <= 4000) return 200
  if (capital >= 5000 && capital <= 9000) return 250
  if (capital >= 10000 && capital <= 14000) return 300
  if (capital >= 15000 && capital <= 19000) return 350
  return 0
}

export function calcSolidario(
  capital: number,
  tipoGrupo: 'REGULAR' | 'RESCATE' = 'REGULAR'
): LoanCalculation {
  const plazo = 8
  const tasaInteres = tipoGrupo === 'RESCATE' ? 0.195 : 0.175
  const totalPago = roundTwo(capital * tasaInteres * plazo)
  const pagoSemanal = roundTwo(totalPago / plazo)
  const interes = roundTwo(totalPago - capital)

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

// ─── INDIVIDUAL ──────────────────────────────────────────────────────────────
//
// Plazo: 12 semanas, pago semanal
// Tasa: $170 por cada mil = 0.170 sobre el capital
// Comisión por apertura varía según ciclo del cliente:
//   Ciclo 1:  10% · Ciclo 2: 7% · Ciclo 3+: 5% · Con atraso: 12%
// La comisión se cobra aparte al activar (el cliente recibe el capital completo)
// Validaciones: $4,000–$20,000 · edad 18–64 · titular + 1 aval (2 avales si >$15,000)

export function calcComisionIndividual(ciclo: number, tuvoAtraso: boolean): number {
  if (tuvoAtraso) return 0.12
  if (ciclo === 1) return 0.10
  if (ciclo === 2) return 0.07
  return 0.05 // ciclo 3+
}

export function calcIndividual(
  capital: number,
  ciclo = 1,
  tuvoAtraso = false
): LoanCalculation {
  const plazo = 12
  const tasaInteres = 0.170
  const tasaComision = calcComisionIndividual(ciclo, tuvoAtraso)
  const comision = roundTwo(capital * tasaComision)
  const montoReal = capital
  const totalPago = roundTwo(capital * tasaInteres * plazo)
  const pagoSemanal = roundTwo(totalPago / plazo)
  const interes = roundTwo(totalPago - capital)

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

// ─── ÁGIL ────────────────────────────────────────────────────────────────────
//
// Plazo: 24 días hábiles (lunes–viernes, sin festivos)
// Tasa según historial del cliente:
//   Cliente regular:   $65 por cada mil = 0.065 sobre el capital
//   Cliente irregular: $75 por cada mil = 0.075 sobre el capital
// Seguro de apertura (cobrar al cliente por separado):
//   Capital $2,000–$5,000  → $200
//   Capital $6,000–$9,000  → $250
//   Capital $10,000–$14,000 → $300
//   Capital $15,000–$19,000 → $350
// Validaciones: $2,000–$20,000 · edad 18–45 · titular + 1 aval

export function calcSeguroAgil(capital: number): number {
  if (capital >= 2000 && capital <= 5000) return 200
  if (capital >= 6000 && capital <= 9000) return 250
  if (capital >= 10000 && capital <= 14000) return 300
  if (capital >= 15000 && capital <= 19000) return 350
  return 0
}

export function calcAgil(capital: number, clienteIrregular = false): LoanCalculation {
  const plazo = 24
  const tasaInteres = clienteIrregular ? 0.075 : 0.065
  const totalPago = roundTwo(capital * tasaInteres * plazo)
  const pagoDiario = roundTwo(totalPago / plazo)
  const interes = roundTwo(totalPago - capital)

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

// ─── FIDUCIARIO ──────────────────────────────────────────────────────────────
//
// Plazo: 12 quincenas (pago cada 15 días)
// Comisión por apertura: 10% sobre el capital
// Monto mínimo: 40% del valor de la garantía
// Monto máximo: 50% del valor de la garantía
// La tasa la define la empresa — se recibe como parámetro
// Validaciones: titular + 1 aval (2 avales si >$15,000) · edad 18–64

export function calcFiduciario(capital: number, tasaInteres: number): LoanCalculation {
  const plazo = 12  // 12 quincenas
  const comision = roundTwo(capital * 0.10)
  const montoReal = capital
  const interes = roundTwo(capital * tasaInteres)
  const totalPago = roundTwo(capital + interes)
  const pagoQuincenal = roundTwo(totalPago / plazo)

  return {
    capital,
    tasaInteres,
    comision,
    montoReal,
    interes,
    totalPago,
    pagoQuincenal,
    plazo,
  }
}

// ─── TARIFA DE APERTURA ─────────────────────────────────────────────────────
//
// Monto que el cliente debe pagar al activar el crédito:
//   SOLIDARIO / AGIL  → seguro (tabla por monto)
//   INDIVIDUAL / FIDUCIARIO → comisión (% sobre capital, ya calculada en el Loan)

export function calcTarifaApertura(
  tipo: 'SOLIDARIO' | 'INDIVIDUAL' | 'AGIL' | 'FIDUCIARIO',
  capital: number,
  comisionAlmacenada?: number
): { monto: number; concepto: 'SEGURO' | 'COMISION' } {
  if (tipo === 'SOLIDARIO') return { monto: calcSeguroSolidario(capital), concepto: 'SEGURO' }
  if (tipo === 'AGIL') return { monto: calcSeguroAgil(capital), concepto: 'SEGURO' }
  return { monto: comisionAlmacenada ?? 0, concepto: 'COMISION' }
}

// ─── DISPATCHER ─────────────────────────────────────────────────────────────
//
// opciones — ciclo, tuvoAtraso, clienteIrregular, tipoGrupo
// tasaInteres — solo aplica en FIDUCIARIO (los demás tienen tasas fijas)

interface CalcOpciones {
  ciclo?: number
  tuvoAtraso?: boolean
  clienteIrregular?: boolean
  tipoGrupo?: 'REGULAR' | 'RESCATE'
}

export function calcLoan(
  tipo: 'SOLIDARIO' | 'INDIVIDUAL' | 'AGIL' | 'FIDUCIARIO',
  capital: number,
  tasaInteres?: number,
  opciones: CalcOpciones = {}
): LoanCalculation {
  switch (tipo) {
    case 'SOLIDARIO':
      return calcSolidario(capital, opciones.tipoGrupo ?? 'REGULAR')
    case 'INDIVIDUAL':
      return calcIndividual(capital, opciones.ciclo ?? 1, opciones.tuvoAtraso ?? false)
    case 'AGIL':
      return calcAgil(capital, opciones.clienteIrregular ?? false)
    case 'FIDUCIARIO':
      return calcFiduciario(capital, tasaInteres ?? 0.30)
  }
}
