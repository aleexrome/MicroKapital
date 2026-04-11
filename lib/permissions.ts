/**
 * Devuelve true si el usuario es el "Operations Admin" — la persona que puede:
 *  - Deshacer pagos (revertir PaymentSchedule PAID → PENDING)
 *  - Editar fechaVencimiento de cualquier fila del calendario (incluyendo PAID)
 *
 * Lógica de resolución (en orden de prioridad):
 *  1. Si OPERATIONS_ADMIN_EMAIL está configurado → compara email exacto
 *  2. Si no está configurado → DIRECTOR_GENERAL y SUPER_ADMIN tienen acceso
 *     (en una instalación típica, solo hay un Director General: la dueña del sistema)
 */
export function isOperationsAdmin(
  email: string | null | undefined,
  rol?: string | null,
): boolean {
  const target =
    process.env.OPERATIONS_ADMIN_EMAIL?.trim() ||
    process.env.SUPER_ADMIN_EMAIL?.trim()

  if (target) {
    // Env var configurado → verificar por email exacto
    return !!email && email.toLowerCase() === target.toLowerCase()
  }

  // Sin env var → permitir al Director General y Super Admin
  return rol === 'DIRECTOR_GENERAL' || rol === 'SUPER_ADMIN'
}
