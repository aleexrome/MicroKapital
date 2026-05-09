import { startOfDayMx } from './timezone'

/**
 * Returns the Monday of the week containing d, anchored to the CDMX
 * calendar day. The returned Date sits at 06:00 UTC (= 00:00 CDMX) of the
 * Monday calendar day in Mexico City. Anchoring to CDMX is required so the
 * weekday calculation matches Mexico's local day, not the Vercel server's
 * UTC day — otherwise a Friday 8 PM CDMX (= Saturday 02:00 UTC) gets read
 * as already-Saturday and falls into the wrong week.
 */
export function getMonday(d: Date): Date {
  const date = startOfDayMx(d)
  const day = date.getUTCDay() // weekday of the CDMX calendar day; 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day
  date.setUTCDate(date.getUTCDate() + diff)
  return date
}

/** Returns the Sunday (23:59:59.999 UTC) of the week starting on monday */
export function getWeekEnd(monday: Date): Date {
  const d = new Date(monday)
  d.setUTCDate(d.getUTCDate() + 6)
  d.setUTCHours(23, 59, 59, 999)
  return d
}

/** Returns the last `count` week Mondays, newest first (index 0 = current week) */
export function semanasRecientes(count: number): Date[] {
  const thisMonday = getMonday(new Date())
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(thisMonday)
    d.setUTCDate(d.getUTCDate() - i * 7)
    return d
  })
}

/** "6 al 12 de abril de 2026" */
export function formatWeekLabel(monday: Date): string {
  const sunday = getWeekEnd(monday)
  const mOpts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', timeZone: 'UTC' }
  const sOpts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }
  return `${monday.toLocaleDateString('es-MX', mOpts)} al ${sunday.toLocaleDateString('es-MX', sOpts)}`
}

/** Monday date → URL-safe "YYYY-MM-DD" */
export function mondayToId(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * "YYYY-MM-DD" → Date a 06:00 UTC (= 00:00 CDMX) del lunes.
 * El offset 06:00 mantiene simetría con `getMonday`, que también devuelve
 * el inicio del día calendario CDMX. Importante para que comparaciones
 * `idToMonday(id).getTime() === getMonday(new Date()).getTime()` sigan
 * funcionando (ej. resaltar semana actual en /rutas/[semana]).
 */
export function idToMonday(id: string): Date {
  return new Date(id + 'T06:00:00.000Z')
}

// ── Semana de Sábado a Viernes — sólo para la sección Rutas ──────────────

/**
 * Returns the Saturday of the Sat–Fri week containing d, anchored to the
 * CDMX calendar day. The returned Date sits at 06:00 UTC (= 00:00 CDMX) of
 * the Saturday calendar day in Mexico City. See `getMonday` for why we
 * anchor to CDMX before computing the weekday.
 */
export function getSaturday(d: Date): Date {
  const date = startOfDayMx(d)
  const day = date.getUTCDay() // weekday of the CDMX calendar day; 0=Sun … 5=Fri, 6=Sat
  const diff = day === 6 ? 0 : -(day + 1)
  date.setUTCDate(date.getUTCDate() + diff)
  return date
}

/** Returns the Friday (23:59:59.999 UTC) that ends the Sat–Fri week starting on saturday */
export function getFriday(saturday: Date): Date {
  const d = new Date(saturday)
  d.setUTCDate(d.getUTCDate() + 6)
  d.setUTCHours(23, 59, 59, 999)
  return d
}

/** Returns the last `count` Sat–Fri week Saturdays, newest first (index 0 = current week) */
export function semanasRecientesSatFri(count: number): Date[] {
  const thisSat = getSaturday(new Date())
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(thisSat)
    d.setUTCDate(d.getUTCDate() - i * 7)
    return d
  })
}

/** "4 al 10 de abril de 2026" for a Sat–Fri week */
export function formatWeekLabelSatFri(saturday: Date): string {
  const friday = getFriday(saturday)
  const satOpts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', timeZone: 'UTC' }
  const friOpts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }
  return `${saturday.toLocaleDateString('es-MX', satOpts)} al ${friday.toLocaleDateString('es-MX', friOpts)}`
}

/** Saturday date → URL-safe "YYYY-MM-DD" */
export function saturdayToId(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * "YYYY-MM-DD" → Date a 06:00 UTC (= 00:00 CDMX) del sábado.
 * Ver nota en `idToMonday` sobre por qué 06:00 y no 00:00.
 */
export function idToSaturday(id: string): Date {
  return new Date(id + 'T06:00:00.000Z')
}
