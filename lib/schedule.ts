import type { ScheduleStatus } from '@prisma/client'
import { todayMx, startOfDayMx } from '@/lib/timezone'

export interface OverdueSchedule {
  estado: ScheduleStatus
  fechaVencimiento: Date | string
}

/**
 * Determina si un schedule está en mora.
 *
 * Definición de negocio: mora = pago no liquidado cuyo vencimiento es ayer
 * o antes (en zona horaria de CDMX). Hoy CDMX todavía no es mora — es
 * "por cobrar".
 *
 * Default `today` = inicio del día CDMX (UTC-6 sin DST). Si el caller
 * tiene su propia referencia, puede pasarla.
 */
export function isOverdue(s: OverdueSchedule, today: Date = todayMx()): boolean {
  if (s.estado !== 'PENDING' && s.estado !== 'PARTIAL') return false

  const today0 = startOfDayMx(today)
  const due = startOfDayMx(new Date(s.fechaVencimiento))

  return due < today0
}

/**
 * Construye el `where` de Prisma para encontrar schedules en mora.
 * Equivalente al helper isOverdue() pero ejecutable en BD.
 *
 * Default `today` = inicio del día CDMX.
 *
 * Uso típico:
 *   prisma.paymentSchedule.findMany({ where: overdueWhere() })
 *   prisma.paymentSchedule.count({ where: { ...overdueWhere(), loan: {...} } })
 */
export function overdueWhere(today: Date = todayMx()) {
  const today0 = startOfDayMx(today)
  return {
    estado: { in: ['PENDING', 'PARTIAL'] as ScheduleStatus[] },
    fechaVencimiento: { lt: today0 },
  }
}
