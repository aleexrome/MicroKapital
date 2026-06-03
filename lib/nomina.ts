import type { PrismaClient } from '@prisma/client'
import {
  GERENTES_AGREGADOS_POR_SUCURSAL,
  metaColocacion,
  perfilPorCobranza,
  normalizarNombre,
  type Perfil,
} from '@/lib/cobranza-semanal'

/**
 * Cálculo de nómina semanal (sábado a viernes 14:00 CDMX).
 *
 * Reglas (entregadas por Dirección):
 *
 *  ── Sueldo base ────────────────────────────────────────────────────────
 *  Viene de la ficha de RH (EmployeeRecord.sueldo). Si el empleado no
 *  tiene ficha, marcamos sinFichaRH=true y la UI muestra "Aún no estás
 *  dado de alta en RH" sin calcular nada.
 *
 *  ── Comisión por crédito ───────────────────────────────────────────────
 *  Depende del perfil del empleado y de si el crédito es nuevo o renovado.
 *
 *  ── Perfil ─────────────────────────────────────────────────────────────
 *  Se deriva de la cobranza pactada de la semana (ver lib/cobranza-semanal).
 *
 *      Junior     ≤ $74,999  cobra: base + comisión NUEVO/RENOVACION
 *      Excelencia $75k-199k  cobra: base + comisión NUEVO (todos) + 1% cobranza
 *      Senior     ≥ $200k    cobra: base + 1% colocación zona + 0.5% cobranza zona
 *
 *  ── Gates ──────────────────────────────────────────────────────────────
 *  Para que el variable se pague, deben cumplir:
 *      Todos:      cobranza efectiva ≥ 98% de pactada
 *      Junior:     + colocación real ≥ meta colocación
 *      Excelencia: + colocación real ≥ meta colocación
 *      Senior:     (solo el gate de cobranza, no requiere meta colocación)
 *
 *  Si NO cumplen, sale solo el sueldo base.
 *
 *  ── Ventana ────────────────────────────────────────────────────────────
 *  Sábado 00:00 UTC al viernes 14:00 CDMX (= viernes 20:00 UTC). Los
 *  créditos cuentan por `fechaDesembolso`; los pagos por `fechaHora`.
 *  Schedules para "cobranza pactada" siempre se toman de toda la semana.
 */

const PCT_COBRANZA_MINIMA = 0.98
const BONO_COBRANZA_EXCELENCIA = 0.01
const BONO_COLOCACION_SENIOR   = 0.01
const BONO_COBRANZA_SENIOR     = 0.005

const COMISIONES = {
  NUEVO:      { SOLIDARIO: 500, INDIVIDUAL: 250, AGIL: 100 },
  RENOVACION: { SOLIDARIO: 300, INDIVIDUAL: 200, AGIL:  50 },
}
const FIDUCIARIO_PCT = 0.05

type LoanTipo = 'SOLIDARIO' | 'INDIVIDUAL' | 'AGIL' | 'FIDUCIARIO'

function comisionPorCredito(
  tipo: LoanTipo,
  esRenovacion: boolean,
  capital: number,
  perfil: Perfil | null,
): number {
  if (tipo === 'FIDUCIARIO') return capital * FIDUCIARIO_PCT
  // Excelencia cobra todos sus créditos a tarifa NUEVO.
  const tabla = perfil === 'EXCELENCIA' || !esRenovacion
    ? COMISIONES.NUEVO
    : COMISIONES.RENOVACION
  return tabla[tipo]
}

export interface NominaCredito {
  id: string
  tipo: LoanTipo
  esRenovacion: boolean
  capital: number
  comision: number
  clienteNombre: string | null
}

export interface NominaEmpleado {
  userId: string
  nombre: string
  rol: string
  sucursal: string | null

  /** Si no se encontró ficha de RH para el User. La UI muestra mensaje. */
  sinFichaRH: boolean

  perfil: Perfil | null
  sueldoBase: number

  // Performance
  cobranzaPactada: number
  cobranzaEfectiva: number
  cobranzaPct: number
  cumpleCobranza: boolean

  metaColocacion: number
  colocacionReal: number
  colocacionPct: number
  /** Junior/Excelencia: colocacionReal >= meta. Senior: siempre true. */
  cumpleColocacion: boolean

  // Componentes
  creditos: NominaCredito[]
  comisionPorCreditos: number
  bonoCobranzaEfectiva: number
  bonoColocacion: number

  // Resultado
  totalAPagar: number
  cumpleGates: boolean
}

/** Devuelve el cutoff (viernes 14:00 CDMX = 20:00 UTC) acotado por now. */
export function cutoffViernes14(saturday: Date, now: Date = new Date()): Date {
  const cutoff = new Date(saturday)
  cutoff.setUTCDate(cutoff.getUTCDate() + 6)
  cutoff.setUTCHours(20, 0, 0, 0)
  return now < cutoff ? now : cutoff
}

/** Sucursales que pertenecen al alcance de un user (zona si es agregador,
 *  su branchId en otro caso). */
function alcanceBranchIds(user: { id: string; branchId: string | null; zonaBranchIds: unknown }): string[] {
  if (GERENTES_AGREGADOS_POR_SUCURSAL.has(user.id)) {
    if (Array.isArray(user.zonaBranchIds) && user.zonaBranchIds.length > 0) {
      return user.zonaBranchIds as string[]
    }
  }
  return user.branchId ? [user.branchId] : []
}

export async function calcularNominaSemana(
  prisma: PrismaClient,
  companyId: string,
  saturday: Date,
  friday: Date,
  cutoff: Date,
): Promise<NominaEmpleado[]> {
  const [users, employees, schedules, loans] = await Promise.all([
    prisma.user.findMany({
      where: { companyId, activo: true },
      select: {
        id: true, nombre: true, rol: true,
        branchId: true, zonaBranchIds: true,
        branch: { select: { nombre: true } },
      },
    }),
    prisma.employeeRecord.findMany({
      where: { companyId, estatus: 'ACTIVO' },
      select: { nombre: true, sueldo: true, sucursal: true },
    }),
    prisma.paymentSchedule.findMany({
      where: {
        fechaVencimiento: { gte: saturday, lte: friday },
        estado: { not: 'FINANCIADO' },
        loan: { companyId, estado: { in: ['ACTIVE', 'LIQUIDATED', 'DEFAULTED'] } },
      },
      select: {
        montoEsperado: true,
        estado: true,
        payments: {
          where: { fechaHora: { gte: saturday, lte: cutoff } },
          select: { monto: true },
        },
        loan: { select: { cobradorId: true, branchId: true } },
      },
    }),
    prisma.loan.findMany({
      where: {
        companyId,
        fechaDesembolso: { gte: saturday, lte: cutoff },
        estado: { in: ['ACTIVE', 'LIQUIDATED'] },
      },
      select: {
        id: true,
        tipo: true,
        capital: true,
        loanOriginalId: true,
        loanGroupId: true,
        cobradorId: true,
        branchId: true,
        client: { select: { nombreCompleto: true } },
        loanGroup: { select: { nombre: true } },
      },
    }),
  ])

  // Ficha de RH por nombre normalizado.
  const rhPorNombre = new Map<string, { sueldo: number; sucursal: string | null }>()
  for (const e of employees) {
    rhPorNombre.set(normalizarNombre(e.nombre), {
      sueldo: e.sueldo ? e.sueldo.toNumber() : 0,
      sucursal: e.sucursal,
    })
  }

  // Acumuladores por cobrador y por branch.
  const pactPorCobrador  = new Map<string, number>()
  const efecPorCobrador  = new Map<string, number>()
  const pactPorBranch    = new Map<string, number>()
  const efecPorBranch    = new Map<string, number>()
  for (const s of schedules) {
    const sinPaymentEstaSemana = s.payments.length === 0
    const yaCobradoAntes       = s.estado === 'PAID' || s.estado === 'ADVANCE'
    if (sinPaymentEstaSemana && yaCobradoAntes) continue

    const meta = s.montoEsperado.toNumber()
    const cobrado = Math.min(
      s.payments.reduce((sum, p) => sum + p.monto.toNumber(), 0),
      meta,
    )

    pactPorCobrador.set(s.loan.cobradorId, (pactPorCobrador.get(s.loan.cobradorId) ?? 0) + meta)
    efecPorCobrador.set(s.loan.cobradorId, (efecPorCobrador.get(s.loan.cobradorId) ?? 0) + cobrado)
    pactPorBranch.set(s.loan.branchId,     (pactPorBranch.get(s.loan.branchId)     ?? 0) + meta)
    efecPorBranch.set(s.loan.branchId,     (efecPorBranch.get(s.loan.branchId)     ?? 0) + cobrado)
  }

  // Colocación por cobrador y por branch.
  //
  // Tratamiento especial de SOLIDARIO: cada miembro del grupo es una fila
  // en Loan, pero la comisión se paga UNA vez por grupo, no por miembro.
  // Por eso colapsamos los miembros de cada grupo en una sola entrada de
  // creditosPorCobrador (con el capital sumado de todos los integrantes
  // y el nombre del grupo como cliente). En cambio el monto total para
  // el 1% de colocación de Senior sí suma todo (siempre representa el
  // dinero efectivamente colocado en la semana).
  const creditosPorCobrador   = new Map<string, NominaCredito[]>()
  const colocMontoPorCobrador = new Map<string, number>()
  const colocMontoPorBranch   = new Map<string, number>()
  const grupoSolidarioIndex   = new Map<string, NominaCredito>() // loanGroupId → credito

  for (const l of loans) {
    const capital = l.capital.toNumber()

    // Acumulado monetario (para el 1% del Senior) — esto SÍ suma por miembro.
    colocMontoPorCobrador.set(l.cobradorId, (colocMontoPorCobrador.get(l.cobradorId) ?? 0) + capital)
    colocMontoPorBranch.set(l.branchId,     (colocMontoPorBranch.get(l.branchId)     ?? 0) + capital)

    // Para la lista de créditos (que controla la comisión por crédito y se
    // muestra en el desglose), SOLIDARIO agrupa por loanGroupId.
    if (l.tipo === 'SOLIDARIO' && l.loanGroupId) {
      const existing = grupoSolidarioIndex.get(l.loanGroupId)
      if (existing) {
        existing.capital += capital
        // esRenovacion: si CUALQUIER miembro trae loanOriginalId marcamos
        // todo el grupo como renovación (en la práctica es uniforme).
        if (l.loanOriginalId !== null) existing.esRenovacion = true
        continue
      }
      const credito: NominaCredito = {
        id: l.loanGroupId,
        tipo: 'SOLIDARIO',
        esRenovacion: l.loanOriginalId !== null,
        capital,
        comision: 0,
        clienteNombre: l.loanGroup?.nombre ?? null,
      }
      grupoSolidarioIndex.set(l.loanGroupId, credito)
      const arr = creditosPorCobrador.get(l.cobradorId) ?? []
      arr.push(credito)
      creditosPorCobrador.set(l.cobradorId, arr)
      continue
    }

    // INDIVIDUAL / AGIL / FIDUCIARIO (o SOLIDARIO sin grupo, caso raro):
    // se cuenta por loan, igual que antes.
    const credito: NominaCredito = {
      id: l.id,
      tipo: l.tipo as LoanTipo,
      esRenovacion: l.loanOriginalId !== null,
      capital,
      comision: 0,
      clienteNombre: l.client?.nombreCompleto ?? null,
    }
    const arr = creditosPorCobrador.get(l.cobradorId) ?? []
    arr.push(credito)
    creditosPorCobrador.set(l.cobradorId, arr)
  }

  const result: NominaEmpleado[] = []
  for (const u of users) {
    const ficha = rhPorNombre.get(normalizarNombre(u.nombre))
    const sueldoBase = ficha?.sueldo ?? 0
    const sucursal   = ficha?.sucursal ?? u.branch?.nombre ?? null

    const esAggregador = GERENTES_AGREGADOS_POR_SUCURSAL.has(u.id)
    const zoneIds      = esAggregador ? alcanceBranchIds(u) : null

    const cobranzaPactada = esAggregador && zoneIds
      ? zoneIds.reduce((s, b) => s + (pactPorBranch.get(b) ?? 0), 0)
      : (pactPorCobrador.get(u.id) ?? 0)

    const cobranzaEfectiva = esAggregador && zoneIds
      ? zoneIds.reduce((s, b) => s + (efecPorBranch.get(b) ?? 0), 0)
      : (efecPorCobrador.get(u.id) ?? 0)

    const colocacionReal = esAggregador && zoneIds
      ? zoneIds.reduce((s, b) => s + (colocMontoPorBranch.get(b) ?? 0), 0)
      : (colocMontoPorCobrador.get(u.id) ?? 0)

    const creditos = esAggregador ? [] : (creditosPorCobrador.get(u.id) ?? [])

    const perfil = perfilPorCobranza(cobranzaPactada)

    // Comisión por crédito (no aplica a Senior, que cobra por % colocación).
    if (perfil !== 'SENIOR') {
      for (const c of creditos) {
        c.comision = comisionPorCredito(c.tipo, c.esRenovacion, c.capital, perfil)
      }
    }

    const cobranzaPct  = cobranzaPactada > 0 ? cobranzaEfectiva / cobranzaPactada : 0
    const cumpleCobranza = cobranzaPct >= PCT_COBRANZA_MINIMA

    const meta = metaColocacion(cobranzaPactada)
    const colocacionPct = meta > 0 ? colocacionReal / meta : 0
    // Senior no requiere gate de colocación; Junior y Excelencia sí.
    const cumpleColocacion = perfil === 'SENIOR' ? true : colocacionReal >= meta

    const cumpleGates = cumpleCobranza && cumpleColocacion

    let comisionPorCreditos = 0
    let bonoCobranzaEfectiva = 0
    let bonoColocacion = 0

    if (perfil === 'JUNIOR') {
      comisionPorCreditos = creditos.reduce((s, c) => s + c.comision, 0)
    } else if (perfil === 'EXCELENCIA') {
      comisionPorCreditos  = creditos.reduce((s, c) => s + c.comision, 0)
      bonoCobranzaEfectiva = cobranzaEfectiva * BONO_COBRANZA_EXCELENCIA
    } else if (perfil === 'SENIOR') {
      bonoColocacion       = colocacionReal   * BONO_COLOCACION_SENIOR
      bonoCobranzaEfectiva = cobranzaEfectiva * BONO_COBRANZA_SENIOR
    }

    const variableTotal = cumpleGates
      ? comisionPorCreditos + bonoCobranzaEfectiva + bonoColocacion
      : 0
    const totalAPagar = sueldoBase + variableTotal

    result.push({
      userId: u.id,
      nombre: u.nombre,
      rol: u.rol,
      sucursal,
      sinFichaRH: !ficha,
      perfil,
      sueldoBase,
      cobranzaPactada,
      cobranzaEfectiva,
      cobranzaPct,
      cumpleCobranza,
      metaColocacion: meta,
      colocacionReal,
      colocacionPct,
      cumpleColocacion,
      creditos,
      comisionPorCreditos,
      bonoCobranzaEfectiva,
      bonoColocacion,
      totalAPagar,
      cumpleGates,
    })
  }

  // Ordenamos por total descendente para el listado del Director.
  result.sort((a, b) => b.totalAPagar - a.totalAPagar)
  return result
}
