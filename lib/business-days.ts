import { addDays, getDay, getMonth, getDate, isSameDay } from 'date-fns'

// Festivos fijos de México (mes es 0-indexado)
const FESTIVOS_FIJOS: Array<{ mes: number; dia: number }> = [
  { mes: 0, dia: 1 },   // 1 Enero — Año Nuevo
  { mes: 1, dia: 5 },   // 5 Febrero — Constitución
  { mes: 2, dia: 21 },  // 21 Marzo — Natalicio Benito Juárez
  { mes: 4, dia: 1 },   // 1 Mayo — Día del Trabajo
  { mes: 8, dia: 16 },  // 16 Septiembre — Independencia
  { mes: 10, dia: 2 },  // 2 Noviembre — Día de Muertos (no es festivo oficial, pero se incluye por práctica)
  { mes: 10, dia: 20 }, // 20 Noviembre — Revolución Mexicana
  { mes: 11, dia: 25 }, // 25 Diciembre — Navidad
]

// Festivos móviles: Semana Santa (Jueves y Viernes Santo)
// Se calculan a partir del algoritmo de Pascua para cada año
function calcularPascua(año: number): Date {
  const a = año % 19
  const b = Math.floor(año / 100)
  const c = año % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31) - 1 // 0-indexado
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(año, mes, dia)
}

function getFestivosMoviles(año: number): Date[] {
  const pascua = calcularPascua(año)
  const juevesSanto = addDays(pascua, -3)
  const viernesSanto = addDays(pascua, -2)
  return [juevesSanto, viernesSanto]
}

/**
 * Verifica si una fecha es festivo oficial en México
 */
export function esFestivo(fecha: Date): boolean {
  const mes = getMonth(fecha)
  const dia = getDate(fecha)
  const año = fecha.getFullYear()

  // Festivos fijos
  if (FESTIVOS_FIJOS.some((f) => f.mes === mes && f.dia === dia)) {
    return true
  }

  // Festivos móviles (Semana Santa)
  const festivosMoviles = getFestivosMoviles(año)
  return festivosMoviles.some((f) => isSameDay(f, fecha))
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
