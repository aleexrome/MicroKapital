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
 * Genera `cantidad` fechas consecutivas saltando sólo sábados y domingos.
 * Los días festivos SÍ se consideran días de cobro (para préstamos AGIL).
 * La fecha de inicio NO se incluye en el resultado.
 */
export function generarFechasLunesViernes(fechaInicio: Date, cantidad: number): Date[] {
  const fechas: Date[] = []
  let actual = new Date(fechaInicio)

  while (fechas.length < cantidad) {
    actual = addDays(actual, 1)
    const diaSemana = getDay(actual)
    if (diaSemana !== 0 && diaSemana !== 6) {
      fechas.push(new Date(actual))
    }
  }

  return fechas
}

/**
 * Genera N fechas semanales a partir de fechaInicio
 * (para préstamos SOLIDARIO e INDIVIDUAL)
 */
export function generarFechasSemanales(fechaInicio: Date, cantidad: number): Date[] {
  const fechas: Date[] = []
  for (let i = 1; i <= cantidad; i++) {
    fechas.push(addDays(fechaInicio, i * 7))
  }
  return fechas
}
