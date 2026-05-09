import { startOfDayMx, MX_TZ } from './timezone'

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

/**
 * Returns the end of Sunday CDMX of the week starting on monday — el último
 * instante representable antes del próximo lunes 00:00 CDMX (= lun 06:00 UTC).
 * Resultado: lunes siguiente 06:00 UTC menos 1 ms = lun 05:59:59.999 UTC =
 * domingo 23:59:59.999 CDMX. Antes la función cortaba en `setUTCHours(23,...)`
 * sobre el domingo UTC, perdiendo las últimas 6 horas del domingo CDMX
 * (de 6 PM a medianoche) — schedules con `fechaVencimiento` ahí se caían
 * del reporte.
 */
export function getWeekEnd(monday: Date): Date {
  const nextMonday = new Date(monday)
  nextMonday.setUTCDate(nextMonday.getUTCDate() + 7)
  return new Date(nextMonday.getTime() - 1)
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

/**
 * "6 al 12 de abril de 2026". Formateo en CDMX (no UTC) porque el final de
 * semana ahora es lun 05:59:59.999 UTC = dom 23:59 CDMX — con tz='UTC' se
 * vería como el lunes siguiente. tz='America/Mexico_City' regresa el día
 * calendario CDMX correcto. Para el inicio (mon a 06:00 UTC = 00:00 CDMX)
 * el resultado es el mismo en ambas zonas.
 */
export function formatWeekLabel(monday: Date): string {
  const sunday = getWeekEnd(monday)
  const mOpts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', timeZone: MX_TZ }
  const sOpts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric', timeZone: MX_TZ }
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

/**
 * Returns the end of Friday CDMX of the Sat–Fri week starting on saturday —
 * el último instante representable antes del próximo sábado 00:00 CDMX
 * (= sáb 06:00 UTC). Resultado: sábado siguiente 06:00 UTC menos 1 ms =
 * sáb 05:59:59.999 UTC = viernes 23:59:59.999 CDMX. Antes la función cortaba
 * en `setUTCHours(23,...)` sobre el viernes UTC, perdiendo las últimas 6
 * horas del viernes CDMX (de 6 PM a medianoche) — schedules con
 * `fechaVencimiento` ahí se caían del reporte (caso de Hugo: 20 schedules
 * de $25k perdidos por este corte).
 */
export function getFriday(saturday: Date): Date {
  const nextSaturday = new Date(saturday)
  nextSaturday.setUTCDate(nextSaturday.getUTCDate() + 7)
  return new Date(nextSaturday.getTime() - 1)
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

/** "4 al 10 de abril de 2026" for a Sat–Fri week. Ver nota en formatWeekLabel. */
export function formatWeekLabelSatFri(saturday: Date): string {
  const friday = getFriday(saturday)
  const satOpts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', timeZone: MX_TZ }
  const friOpts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric', timeZone: MX_TZ }
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
