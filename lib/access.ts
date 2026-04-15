import type { UserRole } from '@prisma/client'

/**
 * Mínimo necesario para derivar el alcance (scope) de datos visibles
 * a un usuario autenticado. Funciona tanto con `SessionUser` (server
 * components) como con `session.user` devuelto por `auth()` (API routes).
 */
export interface AccessUser {
  id: string
  rol: UserRole
  branchId: string | null
}

/**
 * Fragmento `where` de Prisma para modelos que tienen tanto `branchId`
 * como `cobradorId` a nivel raíz (Client, Loan). También se puede
 * anidar dentro de `loan: { ... }` para filtrar PaymentSchedule /
 * Payment por la sucursal y el cobrador del préstamo.
 *
 * Reglas:
 * - SUPER_ADMIN  → sin restricción (fragmento vacío)
 * - GERENTE      → solo registros de su sucursal
 * - COBRADOR     → solo registros de su sucursal Y asignados a él
 * - CLIENTE      → fragmento vacío (no debe acceder a estos listados;
 *                  el middleware lo redirige al portal del cliente)
 */
export function branchScope(
  user: AccessUser
): { branchId?: string; cobradorId?: string } {
  const where: { branchId?: string; cobradorId?: string } = {}

  if ((user.rol === 'GERENTE' || user.rol === 'COBRADOR') && user.branchId) {
    where.branchId = user.branchId
  }
  if (user.rol === 'COBRADOR') {
    where.cobradorId = user.id
  }

  return where
}
