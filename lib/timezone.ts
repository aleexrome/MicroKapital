/**
 * Helpers de zona horaria para Ciudad de México.
 *
 * **CDMX es UTC-6 todo el año** desde octubre 2022 (México eliminó el
 * horario de verano). NO usar offset condicional — siempre UTC-6.
 *
 * El servidor de Vercel corre en UTC, así que un `new Date()` en código
 * de servidor da la hora UTC. Para preguntas como "¿qué día es hoy?"
 * desde la perspectiva del usuario en CDMX, hay que convertir.
 *
 * Caso típico de bug que resuelven estos helpers:
 *   - 29 abril 11 PM CDMX = 30 abril 5 AM UTC
 *   - `new Date().setHours(0,0,0,0)` → 30 abril 00:00 UTC
 *   - La app muestra "30 de abril" cuando el usuario aún está el 29
 *
 * Solución: `todayMx()` regresa el inicio del día CDMX expresado en UTC
 * (06:00 UTC del día calendario CDMX) — eso siempre cae en el día
 * correcto para el usuario.
 */

export const MX_TZ = 'America/Mexico_City'

/** Offset de CDMX en horas (UTC-6). Constante porque ya no hay DST. */
export const MX_OFFSET_HOURS = 6

/** Fecha de hoy en CDMX como string YYYY-MM-DD. */
export function todayMxYMD(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: MX_TZ }).format(new Date())
}

/** Convierte cualquier Date al string YYYY-MM-DD según CDMX. */
export function toMxYMD(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: MX_TZ }).format(d)
}

/**
 * Inicio del día actual en CDMX, expresado como Date (UTC).
 *
 * 00:00 CDMX = 06:00 UTC del mismo día calendario CDMX.
 *
 * Reemplaza el patrón viejo `new Date(); setHours(0,0,0,0)` que daba
 * medianoche UTC y se desfasaba 6 horas.
 */
export function todayMx(): Date {
  const ymd = todayMxYMD()
  return new Date(`${ymd}T06:00:00.000Z`)
}

/**
 * Inicio del día CDMX para un Date dado (NO necesariamente hoy).
 * Útil para normalizar fechas a "principio del día CDMX" antes de
 * comparar o filtrar.
 */
export function startOfDayMx(d: Date): Date {
  const ymd = toMxYMD(d)
  return new Date(`${ymd}T06:00:00.000Z`)
}

/**
 * Final del día CDMX para un Date dado: 23:59:59.999 CDMX
 * (= 05:59:59.999 UTC del día siguiente en CDMX).
 */
export function endOfDayMx(d: Date): Date {
  const start = startOfDayMx(d)
  // +24h - 1ms
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1)
}

/**
 * Construye un Date a partir de un string YYYY-MM-DD interpretándolo
 * como inicio del día CDMX. Útil para convertir el filtro de un
 * <input type="date"> (que el usuario rellenó en CDMX) a un Date
 * comparable con timestamps UTC en la BD.
 */
export function parseMxYMD(ymd: string): Date {
  return new Date(`${ymd}T06:00:00.000Z`)
}

/**
 * Saca un Date `now` (UTC) y lo regresa en su forma natural — solo es
 * un alias semántico para distinguir cuándo SÍ queremos UTC explícito
 * (ej. `Payment.fechaHora` que es timestamp universal).
 */
export function nowUtc(): Date {
  return new Date()
}
