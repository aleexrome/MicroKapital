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
 * Formatea una fecha en español
 */
export function formatDate(date: Date | string, fmt = 'dd/MM/yyyy'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return format(d, fmt, { locale: es })
}

/**
 * Formatea fecha y hora
 */
export function formatDateTime(date: Date | string): string {
  return formatDate(date, "dd/MM/yyyy 'a las' HH:mm")
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
