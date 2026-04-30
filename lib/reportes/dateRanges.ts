/**
 * Helpers de periodos para el módulo Reportes.
 *
 * Convención de semana: lunes 00:00 CDMX → domingo 23:59:59.999 CDMX.
 * Las metas (Goal) viven contra estos rangos. La cobranza, colocación y
 * cumplimiento usan estos mismos límites para que los números cuadren.
 *
 * Todas las funciones que reciben un `ref?: Date` por default usan la
 * fecha actual en CDMX (no UTC del servidor).
 */

import { startOfDayMx, endOfDayMx, todayMx } from '@/lib/timezone'

export interface DateRange {
  inicio: Date
  fin: Date
}

function startOfDay(d: Date): Date {
  return startOfDayMx(d)
}

function endOfDay(d: Date): Date {
  return endOfDayMx(d)
}

/** Lunes de la semana que contiene `ref`, a las 00:00. */
// NOTA: todas las funciones que toman `ref?: Date` defaultean a la
// fecha actual en CDMX (`todayMx()`), y operan con métodos UTC*. El
// "anchor" es 00:00 CDMX (= 06:00 UTC) de cada día, así que los cálculos
// con setUTCDate/getUTCDay arrojan días calendario correctos.

export function startOfWeek(ref: Date = todayMx()): Date {
  const d = startOfDay(ref)
  // getUTCDay: 0=domingo … 1=lunes … 6=sábado. Distancia desde lunes.
  const dist = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - dist)
  return d
}

/** Domingo de la semana que contiene `ref`, a las 23:59:59.999 CDMX. */
export function endOfWeek(ref: Date = todayMx()): Date {
  const lunes = startOfWeek(ref)
  const domingo = new Date(lunes)
  domingo.setUTCDate(domingo.getUTCDate() + 6)
  return endOfDay(domingo)
}

export function weekRange(ref: Date = todayMx()): DateRange {
  return { inicio: startOfWeek(ref), fin: endOfWeek(ref) }
}

/** Semana anterior a `ref`. Para crecimiento de cartera vs semana previa. */
export function previousWeekRange(ref: Date = todayMx()): DateRange {
  const lunesAnt = startOfWeek(ref)
  lunesAnt.setUTCDate(lunesAnt.getUTCDate() - 7)
  const domingoAnt = new Date(lunesAnt)
  domingoAnt.setUTCDate(domingoAnt.getUTCDate() + 6)
  return { inicio: lunesAnt, fin: endOfDay(domingoAnt) }
}

export function startOfMonth(ref: Date = todayMx()): Date {
  // Día 1 del mes calendario CDMX a las 00:00 CDMX
  const d = startOfDay(ref)
  d.setUTCDate(1)
  return d
}

export function endOfMonth(ref: Date = todayMx()): Date {
  // Último día del mes a las 23:59:59.999 CDMX
  const d = startOfDay(ref)
  d.setUTCMonth(d.getUTCMonth() + 1)
  d.setUTCDate(0) // último día del mes anterior = último del mes original
  return endOfDay(d)
}

export function monthRange(ref: Date = todayMx()): DateRange {
  return { inicio: startOfMonth(ref), fin: endOfMonth(ref) }
}

export function startOfYear(ref: Date = todayMx()): Date {
  const d = startOfDay(ref)
  d.setUTCMonth(0)
  d.setUTCDate(1)
  return d
}

export function endOfYear(ref: Date = todayMx()): Date {
  const d = startOfDay(ref)
  d.setUTCMonth(11)
  d.setUTCDate(31)
  return endOfDay(d)
}

export function yearRange(ref: Date = todayMx()): DateRange {
  return { inicio: startOfYear(ref), fin: endOfYear(ref) }
}

export type PeriodoPreset =
  | 'hoy'
  | 'semana'
  | 'semanaAnterior'
  | 'mes'
  | 'mesAnterior'
  | 'trimestre'
  | 'año'

export function rangeFromPreset(preset: PeriodoPreset, ref: Date = todayMx()): DateRange {
  switch (preset) {
    case 'hoy':
      return { inicio: startOfDay(ref), fin: endOfDay(ref) }
    case 'semana':
      return weekRange(ref)
    case 'semanaAnterior':
      return previousWeekRange(ref)
    case 'mes':
      return monthRange(ref)
    case 'mesAnterior': {
      const ant = new Date(ref)
      ant.setUTCMonth(ant.getUTCMonth() - 1)
      return monthRange(ant)
    }
    case 'trimestre': {
      const d = startOfDay(ref)
      const q = Math.floor(d.getUTCMonth() / 3)
      const inicio = new Date(d)
      inicio.setUTCMonth(q * 3)
      inicio.setUTCDate(1)
      const fin = new Date(d)
      fin.setUTCMonth(q * 3 + 3)
      fin.setUTCDate(0)
      return { inicio, fin: endOfDay(fin) }
    }
    case 'año':
      return yearRange(ref)
  }
}

const FORMATTER = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit', month: 'short', year: 'numeric',
  timeZone: 'America/Mexico_City',
})

/** "01 ene 2026 — 07 ene 2026" */
export function formatRangeShort(r: DateRange): string {
  return `${FORMATTER.format(r.inicio)} — ${FORMATTER.format(r.fin)}`
}

/** "Semana del 01 al 07 de enero" para títulos */
export function formatSemanaTitle(r: DateRange): string {
  const ini = new Intl.DateTimeFormat('es-MX', { day: '2-digit', timeZone: 'America/Mexico_City' }).format(r.inicio)
  const fin = new Intl.DateTimeFormat('es-MX', {
    day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Mexico_City',
  }).format(r.fin)
  return `Semana del ${ini} al ${fin}`
}

/**
 * Lista de rangos diarios dentro de [inicio, fin] para usar como bucket
 * de gráficas. Devuelve [{ label: 'Lun 01', inicio, fin }].
 */
export function dailyBuckets(r: DateRange): Array<{ label: string; inicio: Date; fin: Date }> {
  const out: Array<{ label: string; inicio: Date; fin: Date }> = []
  const cur = startOfDay(r.inicio)
  const end = startOfDay(r.fin)
  const fmt = new Intl.DateTimeFormat('es-MX', {
    weekday: 'short', day: '2-digit', timeZone: 'America/Mexico_City',
  })
  while (cur <= end) {
    out.push({
      label: fmt.format(cur).replace('.', ''),
      inicio: new Date(cur),
      fin: endOfDay(cur),
    })
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out
}
