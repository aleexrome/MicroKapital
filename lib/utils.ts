import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formatea un número como moneda mexicana
 * Ej: 1190 → "$1,190.00"
 */
export function formatMoney(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }).format(num)
}

/**
 * Formatea una fecha en español según la zona horaria de CDMX.
 *
 * Maneja dos casos:
 * - `@db.Date` desde Prisma (ej. fechaVencimiento) llega como
 *   "YYYY-MM-DDT00:00:00.000Z" — la fecha pretendida es la parte UTC.
 *   Para esos, los componentes UTC dan el día correcto.
 * - Timestamps reales (ej. Payment.fechaHora) deben formatearse según
 *   CDMX para que un cobro hecho el 29 a las 8 PM CDMX no aparezca
 *   como "30/04/2026" solo porque el servidor está en UTC.
 *
 * Heurística: si la hora UTC es exactamente 00:00:00, se trata como
 * fecha pura (caso @db.Date). En cualquier otro caso, se formatea con
 * timezone CDMX.
 */
export function formatDate(date: Date | string, fmt = 'dd/MM/yyyy'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const esFechaPura =
    d.getUTCHours() === 0 && d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0
  if (esFechaPura) {
    const local = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    return format(local, fmt, { locale: es })
  }
  // Timestamp real → interpretarlo en zona CDMX
  const mxParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d)
  const y = Number(mxParts.find((p) => p.type === 'year')?.value)
  const m = Number(mxParts.find((p) => p.type === 'month')?.value)
  const day = Number(mxParts.find((p) => p.type === 'day')?.value)
  const local = new Date(y, m - 1, day)
  return format(local, fmt, { locale: es })
}

/**
 * Formatea fecha y hora en zona horaria CDMX.
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  // Construir Date "local" con los componentes en CDMX para que date-fns
  // los formatee tal cual.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const parts = fmt.formatToParts(d)
  const y = Number(parts.find((p) => p.type === 'year')?.value)
  const m = Number(parts.find((p) => p.type === 'month')?.value)
  const day = Number(parts.find((p) => p.type === 'day')?.value)
  const hh = Number(parts.find((p) => p.type === 'hour')?.value)
  const mm = Number(parts.find((p) => p.type === 'minute')?.value)
  const local = new Date(y, m - 1, day, hh, mm)
  return format(local, "dd/MM/yyyy 'a las' HH:mm", { locale: es })
}

/**
 * Genera las iniciales de un nombre completo
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
}

/**
 * Trunca un texto al límite dado
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength - 3) + '...'
}
