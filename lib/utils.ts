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
 * Formatea una fecha en español.
 * Usa los componentes UTC del Date para evitar el desfase de zona horaria
 * cuando las fechas se almacenan como medianoche UTC en la BD.
 */
export function formatDate(date: Date | string, fmt = 'dd/MM/yyyy'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  // Normalizar usando componentes UTC → medianoche local con la fecha correcta
  const local = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  return format(local, fmt, { locale: es })
}

/**
 * Formatea fecha y hora (usa tiempo local, no UTC).
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return format(d, "dd/MM/yyyy 'a las' HH:mm", { locale: es })
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
