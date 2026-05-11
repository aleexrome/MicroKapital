import { startOfDayMx } from './timezone'

/**
 * # Semanas de cobranza — agrupación por FECHA CALENDARIO
 *
 * Los `PaymentSchedule.fechaVencimiento` (y `Loan.fechaDesembolso`) se
 * guardan como timestamps "naive": muchos vienen de imports a medianoche
 * UTC (`2026-05-16 00:00:00`), otros del flujo nuevo a 06:00 UTC
 * (`todayMx()`), otros a mediodía UTC (imports viejos). El denominador
 * común es la PARTE DE FECHA (el día calendario) — esa es la intención
 * real ("el cobro vence el 16 de mayo").
 *
 * Por eso las semanas se construyen con límites de fecha calendario en
 * UTC: inicio = `YYYY-MM-DD 00:00:00 UTC`, fin = `YYYY-MM-DD 23:59:59.999
 * UTC` del último día. Así un schedule cuyo día calendario es el 16 de
 * mayo cae en la semana que CONTIENE el 16 de mayo, sin importar la hora.
 *
 * La zona CDMX SOLO se usa para decidir EN QUÉ SEMANA estamos HOY
 * (`getSaturday(new Date())` / `getMonday(new Date())`) — porque "hoy" sí
 * depende del huso horario del usuario.
 */

// ── Semana Lunes–Domingo (reportes generales) ───────────────────────────

/**
 * Lunes (a 00:00:00 UTC de su día calendario) de la semana lun–dom que
 * contiene a `d`, calculado según el día calendario CDMX de `d`.
 */
export function getMonday(d: Date): Date {
  const date = startOfDayMx(d) // 06:00 UTC del día calendario CDMX de d
  const day = date.getUTCDay() // 0 = domingo
  const diff = day === 0 ? -6 : 1 - day
  date.setUTCDate(date.getUTCDate() + diff)
  date.setUTCHours(0, 0, 0, 0) // → 00:00:00 UTC del día calendario del lunes
  return date
}

/** Fin del domingo (23:59:59.999 UTC) de la semana que arranca en `monday`. */
export function getWeekEnd(monday: Date): Date {
  const d = new Date(monday)
  d.setUTCDate(d.getUTCDate() + 6)
  d.setUTCHours(23, 59, 59, 999)
  return d
}

/** Últimos `count` lunes, más reciente primero (índice 0 = semana actual). */
export function semanasRecientes(count: number): Date[] {
  const thisMonday = getMonday(new Date())
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(thisMonday)
    d.setUTCDate(d.getUTCDate() - i * 7)
    return d
  })
}

/** "6 al 12 de abril de 2026". Formateo en UTC porque los límites son
 *  fechas calendario expresadas en UTC. */
export function formatWeekLabel(monday: Date): string {
  const sunday = getWeekEnd(monday)
  const mOpts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', timeZone: 'UTC' }
  const sOpts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }
  return `${monday.toLocaleDateString('es-MX', mOpts)} al ${sunday.toLocaleDateString('es-MX', sOpts)}`
}

/** Lunes → "YYYY-MM-DD" (para URLs). */
export function mondayToId(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** "YYYY-MM-DD" → Date a 00:00:00 UTC del lunes (simétrico con getMonday). */
export function idToMonday(id: string): Date {
  return new Date(id + 'T00:00:00.000Z')
}

// ── Semana Sábado–Viernes (sección Rutas) ───────────────────────────────

/**
 * Sábado (a 00:00:00 UTC de su día calendario) de la semana sáb–vie que
 * contiene a `d`, calculado según el día calendario CDMX de `d`.
 */
export function getSaturday(d: Date): Date {
  const date = startOfDayMx(d) // 06:00 UTC del día calendario CDMX de d
  const day = date.getUTCDay() // 0=dom … 5=vie, 6=sáb
  const diff = day === 6 ? 0 : -(day + 1)
  date.setUTCDate(date.getUTCDate() + diff)
  date.setUTCHours(0, 0, 0, 0) // → 00:00:00 UTC del día calendario del sábado
  return date
}

/** Fin del viernes (23:59:59.999 UTC) de la semana sáb–vie que arranca en `saturday`. */
export function getFriday(saturday: Date): Date {
  const d = new Date(saturday)
  d.setUTCDate(d.getUTCDate() + 6)
  d.setUTCHours(23, 59, 59, 999)
  return d
}

/** Últimos `count` sábados (sáb–vie), más reciente primero (índice 0 = semana actual). */
export function semanasRecientesSatFri(count: number): Date[] {
  const thisSat = getSaturday(new Date())
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(thisSat)
    d.setUTCDate(d.getUTCDate() - i * 7)
    return d
  })
}

/** "4 al 10 de abril de 2026" para una semana sáb–vie. */
export function formatWeekLabelSatFri(saturday: Date): string {
  const friday = getFriday(saturday)
  const satOpts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', timeZone: 'UTC' }
  const friOpts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }
  return `${saturday.toLocaleDateString('es-MX', satOpts)} al ${friday.toLocaleDateString('es-MX', friOpts)}`
}

/** Sábado → "YYYY-MM-DD" (para URLs). */
export function saturdayToId(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** "YYYY-MM-DD" → Date a 00:00:00 UTC del sábado (simétrico con getSaturday). */
export function idToSaturday(id: string): Date {
  return new Date(id + 'T00:00:00.000Z')
}
