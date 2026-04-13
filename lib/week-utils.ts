/** Returns the Monday (00:00:00 UTC) of the week containing d */
export function getMonday(d: Date): Date {
  const date = new Date(d)
  date.setUTCHours(0, 0, 0, 0)
  const day = date.getUTCDay() // 0 = Sunday
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

/** "YYYY-MM-DD" → Monday UTC Date */
export function idToMonday(id: string): Date {
  return new Date(id + 'T00:00:00.000Z')
}

// ── Semana de Sábado a Viernes — sólo para la sección Rutas ──────────────

/** Returns the Saturday (00:00:00 UTC) of the Sat–Fri week containing d */
export function getSaturday(d: Date): Date {
  const date = new Date(d)
  date.setUTCHours(0, 0, 0, 0)
  const day = date.getUTCDay() // 0=Sun … 5=Fri, 6=Sat
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

/** "YYYY-MM-DD" → Saturday UTC Date */
export function idToSaturday(id: string): Date {
  return new Date(id + 'T00:00:00.000Z')
}
