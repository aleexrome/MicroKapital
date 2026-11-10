/**
 * Sucursales virtuales SOLO en /banca.
 *
 * Problema: Toluca opera físicamente como UNA sucursal, pero Dirección
 * quiere ver sus números partidos entre dos equipos ("Toluca I" y
 * "Toluca II") sin crear sucursales reales (eso rompería permisos,
 * árbol de cartera, cobradores, concentradora, etc).
 *
 * Solución: en la vista /banca agrupamos cada movimiento (Payment,
 * Loan.desembolso, MoraCobro, BranchExtraFund, BranchWithdrawal) por
 * una clave VIRTUAL calculada aquí. La base de datos no cambia.
 *
 * Reglas (edita este archivo para ajustar/añadir divisiones):
 *
 *   TOLUCA (branch real):
 *     Toluca I  = cobrador actual = Guadalupe
 *               ∪ cobrador = Diana AND heredadoDeId IS NOT NULL
 *                 (lo que Diana heredó de América Yazmin y Valentina)
 *     Toluca II = cobrador actual = Alma
 *               ∪ cobrador = Diana AND heredadoDeId IS NULL (propio)
 *               ∪ cobrador = Paulina (inactiva, residuo)
 *               ∪ cualquier otro no listado arriba (default)
 *
 * Los adicionales / retiros se asignan a la sub-sucursal que el DG
 * eligió al crearlos (campo subBranchTag). Para los históricos sin
 * tag, caen a la sub-sucursal default (TOLUCA_II para Toluca —
 * considerada la "principal" nueva por Dirección).
 */

/** IDs reales (BD) de los cobradores de Toluca. */
const TOLUCA_BRANCH_ID       = '667fbc3f-dbce-4c78-ad5b-9003a5eb7764'  // mismo id que Tenancingo II? verifica — reemplazar por el real
// NOTA: el id de TOLUCA real debe ponerse aquí. Si no está definido,
// el helper no divide y /banca se ve como siempre (safe default).
const TOLUCA_ID_REAL: string | null = null  // ← poner UUID real de Toluca cuando se despliegue

const USER_GUADALUPE = '9b4d7573-a187-4c22-bb14-1a7e9c9ea6b4'
const USER_DIANA     = 'c9dd2f42-c317-42ff-9fc7-15431d804dbb'
const USER_ALMA      = '156dd716-d9b2-41fd-81ed-3675891a1b32'
const USER_PAULINA   = 'f61ce1b7-89a5-4582-a677-a6f1ad8395ed'

export interface VirtualBranch {
  /** ID virtual único (no está en BD). Se usa en el agregador de /banca. */
  id:       string
  /** Nombre que ve Dirección en el dropdown y en las filas. */
  nombre:   string
  /** branchId real de la sucursal padre. */
  parentId: string
  /** Tag que se guarda en subBranchTag para adicionales/retiros. */
  tag:      string
}

/** Catálogo de sub-sucursales, keyed por `parentBranchId -> VirtualBranch[]`. */
const DIVISIONES: Record<string, VirtualBranch[]> = TOLUCA_ID_REAL ? {
  [TOLUCA_ID_REAL]: [
    { id: `vb:${TOLUCA_ID_REAL}:TOL_I`,  nombre: 'Toluca I',  parentId: TOLUCA_ID_REAL, tag: 'TOL_I'  },
    { id: `vb:${TOLUCA_ID_REAL}:TOL_II`, nombre: 'Toluca II', parentId: TOLUCA_ID_REAL, tag: 'TOL_II' },
  ],
} : {}

/** Default tag cuando un movimiento histórico sin subBranchTag cae en una sucursal partida. */
const DEFAULT_TAG_PARA_PARENT: Record<string, string> = TOLUCA_ID_REAL
  ? { [TOLUCA_ID_REAL]: 'TOL_II' }
  : {}

/** Las sub-sucursales que corresponden a una branch real. Vacío si la branch no está dividida. */
export function virtualBranchesFor(parentBranchId: string): VirtualBranch[] {
  return DIVISIONES[parentBranchId] ?? []
}

/** ¿Esta sucursal está dividida virtualmente? */
export function isSplitBranch(branchId: string): boolean {
  return virtualBranchesFor(branchId).length > 0
}

/** Expande una lista de branches reemplazando cada branch dividida por sus virtuales. */
export function expandBranchesForBanca<T extends { id: string; nombre: string }>(
  branches: T[],
): Array<{ id: string; nombre: string; parentId: string | null }> {
  const out: Array<{ id: string; nombre: string; parentId: string | null }> = []
  for (const b of branches) {
    const subs = virtualBranchesFor(b.id)
    if (subs.length > 0) {
      for (const s of subs) out.push({ id: s.id, nombre: s.nombre, parentId: b.id })
    } else {
      out.push({ id: b.id, nombre: b.nombre, parentId: null })
    }
  }
  return out
}

/**
 * Para un Payment / Loan / MoraCobro: a qué sub-sucursal pertenece
 * según el cobrador actual y el `heredadoDeId` del cliente. Si la
 * sucursal padre no está dividida, devuelve el branchId real.
 */
export function resolveVirtualBranchId(
  branchId: string,
  cobradorId: string | null | undefined,
  heredadoDeId: string | null | undefined,
): string {
  const subs = virtualBranchesFor(branchId)
  if (subs.length === 0) return branchId

  // Reglas específicas de TOLUCA (edita aquí si se agregan más
  // sucursales divididas). El fallback es siempre la sub-sucursal
  // default declarada en DEFAULT_TAG_PARA_PARENT (TOLUCA_II para Toluca).
  if (TOLUCA_ID_REAL && branchId === TOLUCA_ID_REAL) {
    if (cobradorId === USER_GUADALUPE) return virtualIdPorTag(branchId, 'TOL_I')
    if (cobradorId === USER_DIANA) {
      return heredadoDeId
        ? virtualIdPorTag(branchId, 'TOL_I')   // heredado de otros (América/Valentina)
        : virtualIdPorTag(branchId, 'TOL_II')  // propio de Diana
    }
    if (cobradorId === USER_ALMA)     return virtualIdPorTag(branchId, 'TOL_II')
    if (cobradorId === USER_PAULINA)  return virtualIdPorTag(branchId, 'TOL_II')
    return defaultVirtualId(branchId)
  }

  return defaultVirtualId(branchId)
}

/**
 * Para BranchExtraFund / BranchWithdrawal: usa el subBranchTag guardado
 * si viene; si null, cae al default de esa sucursal.
 */
export function resolveVirtualBranchIdFromTag(
  branchId: string,
  subBranchTag: string | null | undefined,
): string {
  const subs = virtualBranchesFor(branchId)
  if (subs.length === 0) return branchId
  if (subBranchTag) {
    const hit = subs.find((s) => s.tag === subBranchTag)
    if (hit) return hit.id
  }
  return defaultVirtualId(branchId)
}

/** Dada una id virtual, devuelve el branchId real padre (o la misma id si no es virtual). */
export function virtualToRealBranchId(virtualId: string): string {
  // Formato: vb:<parent>:<tag>
  if (!virtualId.startsWith('vb:')) return virtualId
  const parts = virtualId.split(':')
  return parts[1] ?? virtualId
}

/** Dada una id virtual, devuelve el tag (TOL_I / TOL_II / ...) o null si no es virtual. */
export function virtualToTag(virtualId: string): string | null {
  if (!virtualId.startsWith('vb:')) return null
  const parts = virtualId.split(':')
  return parts[2] ?? null
}

function virtualIdPorTag(parentBranchId: string, tag: string): string {
  const hit = virtualBranchesFor(parentBranchId).find((s) => s.tag === tag)
  return hit?.id ?? parentBranchId
}

function defaultVirtualId(parentBranchId: string): string {
  const tag = DEFAULT_TAG_PARA_PARENT[parentBranchId]
  if (!tag) return parentBranchId
  return virtualIdPorTag(parentBranchId, tag)
}
