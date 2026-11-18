import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'

/**
 * Error lanzado cuando se detecta un intento de doble-aplicación de pago
 * (típicamente por doble-click de la UI antes de que la primera request
 * termine). El handler debe convertirlo en 409 Conflict.
 */
export class DoublePaymentError extends Error {
  readonly code = 'DOUBLE_PAYMENT'
  constructor(message: string) {
    super(message)
    this.name = 'DoublePaymentError'
  }
}

type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

/**
 * Detecta duplicados por (scheduleId, cobradorId, monto) dentro de una
 * ventana corta. Si hay un Payment no cancelado con esos mismos datos
 * creado en los últimos `windowSeconds` segundos, lanza DoublePaymentError.
 *
 * Caso real: botón "Aplicar" sin debounce + sin idempotencia server —
 * un doble-click del coord crea dos Payments al mismo schedule por el
 * mismo monto con 2 segundos de diferencia. Este guard rechaza el
 * segundo.
 *
 * Llamarlo DENTRO de la transacción, justo antes de `tx.payment.create`.
 */
export async function assertNoDoublePayment(
  tx: TxClient,
  scheduleId: string | null,
  cobradorId: string,
  monto: number | Prisma.Decimal,
  windowSeconds = 30,
): Promise<void> {
  if (!scheduleId) return
  const since = new Date(Date.now() - windowSeconds * 1000)
  const reciente = await tx.payment.findFirst({
    where: {
      scheduleId,
      cobradorId,
      monto:      new Prisma.Decimal(monto),
      canceledAt: null,
      fechaHora:  { gte: since },
    },
    select: { id: true, fechaHora: true },
  })
  if (reciente) {
    const segundos = Math.round((Date.now() - reciente.fechaHora.getTime()) / 1000)
    throw new DoublePaymentError(
      `Ya hay un pago de $${Number(monto).toLocaleString('es-MX')} de este cobrador para esta cuota hace ${segundos}s. Si quieres aplicar otro pago igual, espera medio minuto.`,
    )
  }
}
