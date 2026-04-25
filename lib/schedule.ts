import type { ScheduleStatus } from '@prisma/client'

export interface OverdueSchedule {
  estado: ScheduleStatus
  fechaVencimiento: Date | string
}

/**
 * Determina si un schedule está en mora.
 *
 * Definición de negocio: mora = pago no liquidado cuyo vencimiento es ayer
 * o antes. Hoy todavía no es mora — es "por cobrar".
 *
 * Esto se calcula on-the-fly en lugar de leer un campo OVERDUE en BD,
 * porque ningún job/cron escribe ese estado nunca. Calcularlo aquí
 * garantiza que toda la app use la misma definición.
 */
export function isOverdue(s: OverdueSchedule, today: Date = new Date()): boolean {
  if (s.estado !== 'PENDING' && s.estado !== 'PARTIAL') return false

  const today0 = new Date(today)
  today0.setHours(0, 0, 0, 0)

  const due = new Date(s.fechaVencimiento)
  due.setHours(0, 0, 0, 0)

  return due < today0
}

/**
 * Construye el `where` de Prisma para encontrar schedules en mora.
 * Equivalente al helper isOverdue() pero ejecutable en BD.
 *
 * Uso típico:
 *   prisma.paymentSchedule.findMany({ where: overdueWhere() })
 *   prisma.paymentSchedule.count({ where: { ...overdueWhere(), loan: {...} } })
 */
export function overdueWhere(today: Date = new Date()) {
  const today0 = new Date(today)
  today0.setHours(0, 0, 0, 0)
  return {
    estado: { in: ['PENDING', 'PARTIAL'] as ScheduleStatus[] },
    fechaVencimiento: { lt: today0 },
  }
}
