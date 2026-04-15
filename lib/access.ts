import type { Prisma, UserRole } from '@prisma/client'

/**
 * Alcance (scope) mínimo para derivar el `where` de Prisma a partir
 * de la sesión del usuario. Se aplica a modelos que tienen `branchId`
 * y/o `cobradorId` a nivel raíz (Client, Loan), y también se puede
 * anidar dentro de un `loan: { ... }` para filtrar PaymentSchedule o
 * Payment por la sucursal y el cobrador del préstamo.
 */
export interface AccessUser {
  id: string
  rol: UserRole
  branchId: string | null
  zonaBranchIds?: string[] | null
}

/**
 * Marcador inalcanzable para forzar que la query no devuelva nada
 * cuando el rol del usuario requiere sucursal pero no tiene ninguna
 * asignada. Preferimos "no ver nada" a "ver todo" (fail-closed).
 */
const NO_MATCH = '__NO_BRANCH_ASSIGNED__'

/**
 * Fragmento `where` para Client / Loan que respeta:
 * - SUPER_ADMIN                           → sin restricción.
 * - GERENTE                               → clientes/préstamos de sus
 *   sucursales asignadas (zonaBranchIds o branchId) + los suyos propios
 *   como cobrador.
 * - GERENTE_ZONAL                         → registros de su zona.
 * - DIRECTOR_GENERAL / DIRECTOR_COMERCIAL → registros de su sucursal.
 * - COORDINADOR / COBRADOR                → solo sus propios registros,
 *   restringidos además a su sucursal cuando la tienen.
 * - Sin alcance válido                    → devuelve nada (fail-closed).
 */
export function scopedClientWhere(user: AccessUser): Prisma.ClientWhereInput {
  const { rol, id: userId, branchId, zonaBranchIds } = user

  if (rol === 'SUPER_ADMIN') return {}

  if (rol === 'COORDINADOR' || rol === 'COBRADOR') {
    return {
      cobradorId: userId,
      ...(branchId ? { branchId } : {}),
    }
  }

  if (rol === 'GERENTE') {
    const branchIds = zonaBranchIds?.length
      ? zonaBranchIds
      : branchId
        ? [branchId]
        : []
    if (!branchIds.length) return { id: NO_MATCH }
    return {
      OR: [
        { branchId: { in: branchIds } },
        { cobradorId: userId },
      ],
    }
  }

  if (rol === 'GERENTE_ZONAL') {
    const zoneIds = zonaBranchIds ?? []
    if (!zoneIds.length) return { id: NO_MATCH }
    return { branchId: { in: zoneIds } }
  }

  if (rol === 'DIRECTOR_GENERAL' || rol === 'DIRECTOR_COMERCIAL') {
    if (!branchId) return { id: NO_MATCH }
    return { branchId }
  }

  // Rol desconocido (p.ej. CLIENTE u otro futuro): cero registros.
  return { id: NO_MATCH }
}

/** Igual que `scopedClientWhere` pero tipado para Loan. */
export function scopedLoanWhere(user: AccessUser): Prisma.LoanWhereInput {
  const { rol, id: userId, branchId, zonaBranchIds } = user

  if (rol === 'SUPER_ADMIN') return {}

  if (rol === 'COORDINADOR' || rol === 'COBRADOR') {
    return {
      cobradorId: userId,
      ...(branchId ? { branchId } : {}),
    }
  }

  if (rol === 'GERENTE') {
    const branchIds = zonaBranchIds?.length
      ? zonaBranchIds
      : branchId
        ? [branchId]
        : []
    if (!branchIds.length) return { id: NO_MATCH }
    return {
      OR: [
        { branchId: { in: branchIds } },
        { cobradorId: userId },
      ],
    }
  }

  if (rol === 'GERENTE_ZONAL') {
    const zoneIds = zonaBranchIds ?? []
    if (!zoneIds.length) return { id: NO_MATCH }
    return { branchId: { in: zoneIds } }
  }

  if (rol === 'DIRECTOR_GENERAL' || rol === 'DIRECTOR_COMERCIAL') {
    if (!branchId) return { id: NO_MATCH }
    return { branchId }
  }

  return { id: NO_MATCH }
}
