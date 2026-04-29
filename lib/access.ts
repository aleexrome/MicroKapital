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
 * - DIRECTOR_GENERAL / DIRECTOR_COMERCIAL → toda la cartera de la empresa
 *   (sin restricción de sucursal). El filtro `companyId` lo aplica el
 *   caller. Los directores se siembran con `branchId: null` precisamente
 *   porque manejan toda la empresa; restringirlos por sucursal dejaba
 *   sus dashboards en cero.
 * - GERENTE                               → clientes/préstamos de sus
 *   sucursales asignadas (zonaBranchIds o branchId) + los suyos propios
 *   como cobrador.
 * - GERENTE_ZONAL                         → registros de su zona, con
 *   fallback a su branchId individual si `zonaBranchIds` viene vacío
 *   (p. ej. porque Prisma no lo hidrata como array nativo y el JWT
 *   quedó con `null`).
 * - COORDINADOR / COBRADOR                → solo sus propios registros,
 *   restringidos además a su sucursal cuando la tienen.
 * - Sin alcance válido                    → devuelve nada (fail-closed).
 */
export function scopedClientWhere(user: AccessUser): Prisma.ClientWhereInput {
  const { rol, id: userId, branchId, zonaBranchIds } = user

  if (rol === 'SUPER_ADMIN') return {}

  if (rol === 'DIRECTOR_GENERAL' || rol === 'DIRECTOR_COMERCIAL') return {}

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
    // Fallback a `branchId` cuando `zonaBranchIds` viene vacío/null.
    // Es indispensable: el `authorize()` actual aplica
    // `Array.isArray(user.zonaBranchIds)` y devuelve `null` si Prisma
    // hidrata el campo `Json?` como algo que no es array nativo — deja
    // al GERENTE_ZONAL sin alcance aunque sí tenga `branchId` asignado.
    const zoneIds = zonaBranchIds?.length
      ? zonaBranchIds
      : branchId
        ? [branchId]
        : []
    if (!zoneIds.length) return { id: NO_MATCH }
    return { branchId: { in: zoneIds } }
  }

  // Rol desconocido (p.ej. CLIENTE u otro futuro): cero registros.
  return { id: NO_MATCH }
}

/**
 * Igual que `scopedLoanWhere` pero tipado para CashRegister. CashRegister
 * tiene `branchId` y `cobradorId` a nivel raíz (igual que Loan), así que
 * la lógica de scope es idéntica — sólo cambia el tipo de retorno.
 */
export function scopedCashRegisterWhere(user: AccessUser): Prisma.CashRegisterWhereInput {
  const { rol, id: userId, branchId, zonaBranchIds } = user

  if (rol === 'SUPER_ADMIN') return {}

  if (rol === 'DIRECTOR_GENERAL' || rol === 'DIRECTOR_COMERCIAL') return {}

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
    const zoneIds = zonaBranchIds?.length
      ? zonaBranchIds
      : branchId
        ? [branchId]
        : []
    if (!zoneIds.length) return { id: NO_MATCH }
    return { branchId: { in: zoneIds } }
  }

  return { id: NO_MATCH }
}

/** Igual que `scopedClientWhere` pero tipado para Loan. */
export function scopedLoanWhere(user: AccessUser): Prisma.LoanWhereInput {
  const { rol, id: userId, branchId, zonaBranchIds } = user

  if (rol === 'SUPER_ADMIN') return {}

  if (rol === 'DIRECTOR_GENERAL' || rol === 'DIRECTOR_COMERCIAL') return {}

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
    // Mismo fallback que en `scopedClientWhere` — ver comentario allá.
    const zoneIds = zonaBranchIds?.length
      ? zonaBranchIds
      : branchId
        ? [branchId]
        : []
    if (!zoneIds.length) return { id: NO_MATCH }
    return { branchId: { in: zoneIds } }
  }

  return { id: NO_MATCH }
}

/**
 * Filtro para Loan que excluye préstamos cuyo cliente o grupo (si tiene)
 * fueron soft-deleted vía botón eliminar de DG. Aplicar dentro del
 * `where` de cualquier consulta de Loan, o anidado bajo `loan: {...}`
 * para filtrar PaymentSchedule / Payment del mismo modo. Sin esto,
 * borrar un cliente / grupo no los hace invisibles en cobranza, rutas,
 * agenda, etc. — sus loans aún aparecerían.
 */
export const loanNotDeletedWhere: Prisma.LoanWhereInput = {
  client: { eliminadoEn: null },
  OR: [
    { loanGroupId: null },
    { loanGroup: { eliminadoEn: null } },
  ],
}

/**
 * Visibilidad del desglose de interés.
 *
 * Solo Dirección General, Dirección Comercial y Super Admin pueden ver
 * datos como `tasaInteres`, `interes` y el `totalPago` desglosado como
 * "capital + interés". El resto de roles (gerentes zonales, gerentes,
 * coordinadores, cobradores y clientes) ven únicamente el monto a
 * cobrar/pagar sin exponer cuánto es interés.
 *
 * Aplica a la UI — las queries pueden seguir devolviendo el campo, lo
 * que se controla es qué se renderiza al usuario.
 */
export function canViewInterestData(rol: UserRole): boolean {
  return rol === 'DIRECTOR_GENERAL'
    || rol === 'DIRECTOR_COMERCIAL'
    || rol === 'SUPER_ADMIN'
}
