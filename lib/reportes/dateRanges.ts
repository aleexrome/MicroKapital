/**
 * Helpers de periodos para el módulo Reportes.
 *
 * Convención de semana: lunes 00:00 → domingo 23:59:59.999.
 * Las metas (Goal) viven contra estos rangos. La cobranza, colocación y
 * cumplimiento usan estos mismos límites para que los números cuadren.
 */

export interface DateRange {
  inicio: Date
  fin: Date
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

/** Lunes de la semana que contiene `ref`, a las 00:00. */
export function startOfWeek(ref: Date = new Date()): Date {
  const d = startOfDay(ref)
  // getDay: 0=domingo … 1=lunes … 6=sábado. Quiero distancia desde lunes.
  const dist = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dist)
  return d
}

/** Domingo de la semana que contiene `ref`, a las 23:59:59.999. */
export function endOfWeek(ref: Date = new Date()): Date {
  const lunes = startOfWeek(ref)
  const domingo = new Date(lunes)
  domingo.setDate(domingo.getDate() + 6)
  return endOfDay(domingo)
}

export function weekRange(ref: Date = new Date()): DateRange {
  return { inicio: startOfWeek(ref), fin: endOfWeek(ref) }
}

/** Semana anterior a `ref`. Para crecimiento de cartera vs semana previa. */
export function previousWeekRange(ref: Date = new Date()): DateRange {
  const lunesAnt = startOfWeek(ref)
  lunesAnt.setDate(lunesAnt.getDate() - 7)
  const domingoAnt = new Date(lunesAnt)
  domingoAnt.setDate(domingoAnt.getDate() + 6)
  return { inicio: lunesAnt, fin: endOfDay(domingoAnt) }
}

export function startOfMonth(ref: Date = new Date()): Date {
  return startOfDay(new Date(ref.getFullYear(), ref.getMonth(), 1))
}

export function endOfMonth(ref: Date = new Date()): Date {
  return endOfDay(new Date(ref.getFullYear(), ref.getMonth() + 1, 0))
}

export function monthRange(ref: Date = new Date()): DateRange {
  return { inicio: startOfMonth(ref), fin: endOfMonth(ref) }
}

export function startOfYear(ref: Date = new Date()): Date {
  return startOfDay(new Date(ref.getFullYear(), 0, 1))
}

export function endOfYear(ref: Date = new Date()): Date {
  return endOfDay(new Date(ref.getFullYear(), 11, 31))
}

export function yearRange(ref: Date = new Date()): DateRange {
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

export function rangeFromPreset(preset: PeriodoPreset, ref: Date = new Date()): DateRange {
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
      const ant = new Date(ref.getFullYear(), ref.getMonth() - 1, 15)
      return monthRange(ant)
    }
    case 'trimestre': {
      const q = Math.floor(ref.getMonth() / 3)
      const inicio = startOfDay(new Date(ref.getFullYear(), q * 3, 1))
      const fin = endOfDay(new Date(ref.getFullYear(), q * 3 + 3, 0))
      return { inicio, fin }
    }
    case 'año':
      return yearRange(ref)
  }
}

const FORMATTER = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit', month: 'short', year: 'numeric',
})

/** "01 ene 2026 — 07 ene 2026" */
export function formatRangeShort(r: DateRange): string {
  return `${FORMATTER.format(r.inicio)} — ${FORMATTER.format(r.fin)}`
}

/** "Semana del 01 al 07 de enero" para títulos */
export function formatSemanaTitle(r: DateRange): string {
  const ini = new Intl.DateTimeFormat('es-MX', { day: '2-digit' }).format(r.inicio)
  const fin = new Intl.DateTimeFormat('es-MX', {
    day: '2-digit', month: 'long', year: 'numeric',
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
  const fmt = new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: '2-digit' })
  while (cur <= end) {
    out.push({
      label: fmt.format(cur).replace('.', ''),
      inicio: new Date(cur),
      fin: endOfDay(cur),
    })
    cur.setDate(cur.getDate() + 1)
  }
  return out
}
