/**
 * Devuelve true si el email corresponde al Operations Admin configurado
 * en OPERATIONS_ADMIN_EMAIL (o SUPER_ADMIN_EMAIL como fallback).
 *
 * Solo este usuario puede:
 *  - Deshacer pagos (revertir PaymentSchedule de PAID → PENDING)
 *  - Editar fechaVencimiento de cualquier fila del calendario (incluyendo PAID)
 */
export function isOperationsAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  const target =
    process.env.OPERATIONS_ADMIN_EMAIL?.trim() ||
    process.env.SUPER_ADMIN_EMAIL?.trim()
  if (!target) return false
  return email.toLowerCase() === target.toLowerCase()
}
