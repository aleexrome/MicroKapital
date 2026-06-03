import type { PrismaClient } from '@prisma/client'

/**
 * Lógica compartida de "cobranza semanal" (sábado a viernes) y derivados.
 *
 * Tanto la página /rutas como /recursos-humanos consumen estas reglas:
 *   - meta de colocación a partir del total de cobranza,
 *   - perfil del empleado (Junior / Excelencia / Senior),
 *   - mapa de cobranza semanal por usuario.
 */

// ─── Gerentes con cartera agregada ─────────────────────────────────────────
//
// Estos usuarios no tienen clientes propios asignados como cobradores.
// Por decisión de Dirección General, su tarjeta en /rutas y su perfil en
// /recursos-humanos reflejan el AGREGADO de toda su zona (suma de los
// branches en zonaBranchIds o, en su defecto, su propio branchId).
export const GERENTES_AGREGADOS_POR_SUCURSAL = new Set<string>([
  '3d189694-644b-4b28-b28d-2762a8bad0fb', // Edgar Solís Pérez
  'e31f210d-332a-40c8-81c2-fef20589cebc', // Héctor Eulises Rodríguez Guzmán
])

// ─── Meta de colocación ────────────────────────────────────────────────────
//
// - cobranza semanal <= $74,999  → meta fija de $40,000.
// - cobranza semanal >= $75,000  → 70% de la cobranza.
export function metaColocacion(cobranzaSemanal: number): number {
  return cobranzaSemanal <= 74_999 ? 40_000 : cobranzaSemanal * 0.7
}

// ─── Perfil del empleado ───────────────────────────────────────────────────
//
// Se mapea sobre la cobranza semanal del usuario:
//   - SENIOR     ≥ $200,000  (típicamente gerentes con agregado de zona)
//   - EXCELENCIA $75,000 a $199,999
//   - JUNIOR     ≤ $74,999  (incluye cobranza = 0)
//
// Cuando el empleado no tiene cuenta de app (User) o su rol no participa
// en cobranza, perfilPorCobranza(null) regresa null y la UI muestra "—".
export type Perfil = 'JUNIOR' | 'EXCELENCIA' | 'SENIOR'

export function perfilPorCobranza(cobranzaSemanal: number | null): Perfil | null {
  if (cobranzaSemanal === null) return null
  if (cobranzaSemanal >= 200_000) return 'SENIOR'
  if (cobranzaSemanal >= 75_000)  return 'EXCELENCIA'
  return 'JUNIOR'
}

// ─── Cobranza semanal por usuario ──────────────────────────────────────────
//
// Para una ventana sábado-viernes, regresa un Map<userId, totalAPagar>.
//
// Reglas (idénticas a las de calcCobranza() en /rutas):
//   - Schedules con estado FINANCIADO no cuentan.
//   - Schedules ya PAID/ADVANCE sin payment en la semana son cobros
//     anteriores absorbidos por renovación; no cuentan ni como meta ni
//     como cobrado.
//   - Para gerentes en GERENTES_AGREGADOS_POR_SUCURSAL, el total es la
//     suma de TODOS los schedules de los branches que componen su zona.
export async function cobranzaSemanalPorUsuario(
  prisma: PrismaClient,
  companyId: string,
  weekStart: Date,
  weekEnd: Date,
): Promise<Map<string, number>> {
  const schedules = await prisma.paymentSchedule.findMany({
    where: {
      fechaVencimiento: { gte: weekStart, lte: weekEnd },
      estado: { not: 'FINANCIADO' },
      loan: {
        companyId,
        estado: { in: ['ACTIVE', 'LIQUIDATED', 'DEFAULTED'] },
      },
    },
    select: {
      montoEsperado: true,
      estado: true,
      payments: {
        where: { fechaHora: { gte: weekStart, lte: weekEnd } },
        select: { id: true },
      },
      loan: { select: { cobradorId: true, branchId: true } },
    },
  })

  const perCobrador = new Map<string, number>()
  const perBranch   = new Map<string, number>()

  for (const s of schedules) {
    const sinPaymentEstaSemana = s.payments.length === 0
    const yaCobradoAntes       = s.estado === 'PAID' || s.estado === 'ADVANCE'
    if (sinPaymentEstaSemana && yaCobradoAntes) continue

    const monto = s.montoEsperado.toNumber()
    perCobrador.set(s.loan.cobradorId, (perCobrador.get(s.loan.cobradorId) ?? 0) + monto)
    perBranch.set(s.loan.branchId,     (perBranch.get(s.loan.branchId)     ?? 0) + monto)
  }

  const users = await prisma.user.findMany({
    where: { companyId, activo: true },
    select: { id: true, branchId: true, zonaBranchIds: true },
  })

  const result = new Map<string, number>()
  for (const u of users) {
    if (GERENTES_AGREGADOS_POR_SUCURSAL.has(u.id)) {
      const zoneIds: string[] = Array.isArray(u.zonaBranchIds)
        ? (u.zonaBranchIds as string[])
        : (u.branchId ? [u.branchId] : [])
      const total = zoneIds.reduce((sum, bid) => sum + (perBranch.get(bid) ?? 0), 0)
      result.set(u.id, total)
    } else {
      result.set(u.id, perCobrador.get(u.id) ?? 0)
    }
  }

  return result
}

// ─── Normalización de nombre para emparejar EmployeeRecord con User ────────
//
// Quita acentos y normaliza mayúsculas y espacios. Sirve para emparejar
// "Catalina Salazar Juárez" (User) con "CATALINA SALAZAR JUAREZ" (RH).
export function normalizarNombre(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ')
}
