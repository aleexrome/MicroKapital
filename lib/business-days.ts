import { addDays, getDay } from 'date-fns'

// ──────────────────────────────────────────────────────────────────────
// DECISIÓN OPERATIVA DE MICROKAPITAL
//
// MicroKapital opera TODOS los días hábiles L-V del calendario, SIN
// recorrer pagos por festivos oficiales. Los cobradores van a campo
// aunque sea 20 de noviembre, 16 de septiembre, 2 de noviembre, etc.
// Dejar festivos aquí hacía que:
//   - Los créditos Ágil recorrieran pagos al siguiente día hábil.
//   - Los cobradores se quedaran sin pactado que cobrar.
//   - El pactado del viernes "desapareciera" y no cuadrara con rutas.
//
// Si ALGÚN DÍA se decide descansar una fecha específica (p.ej. "este
// 25-dic-2027 sí descansamos"), se agrega aquí como { mes, dia, año? }
// con año explícito. NO agregar festivos genéricos sin confirmar con
// Dirección — este archivo se revisó múltiples veces y cada vez que
// se agregó un festivo "obvio" (Navidad, 20-nov, Semana Santa) hubo que
// quitarlo porque en la práctica MK opera.
// ──────────────────────────────────────────────────────────────────────
const FESTIVOS_FIJOS: Array<{ mes: number; dia: number }> = []

/**
 * Verifica si una fecha es festivo para efectos de MicroKapital.
 * Por diseño actual siempre retorna false (MK opera todos los días
 * hábiles). Se mantiene la función y FESTIVOS_FIJOS para poder agregar
 * descansos puntuales en el futuro sin tocar los callers.
 */
export function esFestivo(fecha: Date): boolean {
  if (FESTIVOS_FIJOS.length === 0) return false
  const mes = fecha.getMonth()
  const dia = fecha.getDate()
  return FESTIVOS_FIJOS.some((f) => f.mes === mes && f.dia === dia)
}

/**
 * Verifica si una fecha es día hábil (lunes-viernes, no festivo)
 */
export function esDiaHabil(fecha: Date): boolean {
  const diaSemana = getDay(fecha) // 0=Dom, 1=Lun, ..., 6=Sáb
  if (diaSemana === 0 || diaSemana === 6) return false
  if (esFestivo(fecha)) return false
  return true
}

/**
 * Genera exactamente `cantidad` fechas hábiles consecutivas a partir de `fechaInicio`
 * La fecha de inicio NO se incluye en el resultado
 */
export function generarFechasHabiles(fechaInicio: Date, cantidad: number): Date[] {
  const fechas: Date[] = []
  let actual = new Date(fechaInicio)

  while (fechas.length < cantidad) {
    actual = addDays(actual, 1)
    if (esDiaHabil(actual)) {
      fechas.push(new Date(actual))
    }
  }

  return fechas
}

/**
 * Genera N fechas semanales ancladas en fechaPrimerPago (incluida)
 * Pago 1 = fechaPrimerPago, pago 2 = fechaPrimerPago + 7, etc.
 * (para cuando el DG define la fecha del primer pago en la contrapropuesta)
 */
export function generarFechasSemanalesDesde(fechaPrimerPago: Date, cantidad: number): Date[] {
  const fechas: Date[] = []
  for (let i = 0; i < cantidad; i++) {
    fechas.push(addDays(fechaPrimerPago, i * 7))
  }
  return fechas
}

/**
 * Genera N fechas de días hábiles ancladas en fechaPrimerPago (incluida)
 * Pago 1 = fechaPrimerPago, los siguientes son el próximo día hábil consecutivo.
 *
 * Si fechaPrimerPago NO es día hábil (el DG eligió un sábado, domingo o
 * festivo), se recorre al siguiente día hábil: ningún pago de un crédito
 * ágil debe quedar en fin de semana.
 */
export function generarFechasHabilesDesde(fechaPrimerPago: Date, cantidad: number): Date[] {
  let actual = new Date(fechaPrimerPago)
  while (!esDiaHabil(actual)) {
    actual = addDays(actual, 1)
  }
  const fechas: Date[] = [new Date(actual)]
  while (fechas.length < cantidad) {
    actual = addDays(actual, 1)
    if (esDiaHabil(actual)) {
      fechas.push(new Date(actual))
    }
  }
  return fechas
}
export function generarFechasSemanales(fechaInicio: Date, cantidad: number): Date[] {
  const fechas: Date[] = []
  for (let i = 1; i <= cantidad; i++) {
    fechas.push(addDays(fechaInicio, i * 7))
  }
  return fechas
}

export function generarFechasQuincenales(fechaInicio: Date, cantidad: number): Date[] {
  const fechas: Date[] = []
  for (let i = 1; i <= cantidad; i++) {
    fechas.push(addDays(fechaInicio, i * 15))
  }
  return fechas
}

/**
 * Genera N fechas quincenales para créditos FIDUCIARIO con la regla
 * bimensual fija: los pagos SIEMPRE caen el 15 y el 30 de cada mes.
 *
 * Reglas:
 *   - Desembolso día 1..14  → primer pago = 15 del mismo mes.
 *   - Desembolso día 15     → primer pago = 30 del mismo mes.
 *   - Desembolso día 16..29 → primer pago = 30 del mismo mes.
 *   - Desembolso día 30+    → primer pago = 15 del mes siguiente.
 *   - Los siguientes pagos alternan 15 ↔ 30 (cada vez que se toca el 30
 *     avanzamos al 15 del mes siguiente).
 *   - En febrero, el "30" se sustituye por el último día real del mes
 *     (28 o 29 en bisiesto).
 *   - Si un pago cae en sábado o domingo se recorre al viernes anterior
 *     inmediato. El día "conceptual" (15 ó 30) no cambia — solo la
 *     fecha final de pago.
 */
export function generarFechasFiduciario(fechaDesembolso: Date, cantidad: number): Date[] {
  const d = fechaDesembolso.getUTCDate()
  let year = fechaDesembolso.getUTCFullYear()
  let month = fechaDesembolso.getUTCMonth()
  // Día conceptual del próximo pago: 15 (primera quincena) o 30 (segunda).
  let dayConcept: 15 | 30

  if (d < 15) {
    dayConcept = 15
  } else if (d < 30) {
    // Incluye día 15 (según regla: desembolso ese mismo día → siguiente = 30).
    dayConcept = 30
  } else {
    dayConcept = 15
    // Avanzar al mes siguiente.
    const next = new Date(Date.UTC(year, month + 1, 1))
    year = next.getUTCFullYear()
    month = next.getUTCMonth()
  }

  const fechas: Date[] = []
  for (let i = 0; i < cantidad; i++) {
    // Fecha "conceptual" — el 30 se recorta al último día real del mes si
    // no llega (febrero 28/29).
    let dayReal: number = dayConcept
    if (dayConcept === 30) {
      const probe = new Date(Date.UTC(year, month, 30))
      if (probe.getUTCMonth() !== month) {
        // No hubo día 30 → último día del mes.
        dayReal = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
      }
    }
    const conceptFecha = new Date(Date.UTC(year, month, dayReal))
    fechas.push(recorrerAViernesSiFinDeSemana(conceptFecha))

    // Avanzar al siguiente pago conceptual.
    if (dayConcept === 15) {
      dayConcept = 30
    } else {
      dayConcept = 15
      const nextMonth = new Date(Date.UTC(year, month + 1, 1))
      year = nextMonth.getUTCFullYear()
      month = nextMonth.getUTCMonth()
    }
  }

  return fechas
}

/** Sábado → viernes; Domingo → viernes. Lunes-Viernes se queda igual. */
function recorrerAViernesSiFinDeSemana(fecha: Date): Date {
  const dow = fecha.getUTCDay() // 0=Dom, 6=Sáb
  if (dow === 6) return addDays(fecha, -1)
  if (dow === 0) return addDays(fecha, -2)
  return fecha
}
