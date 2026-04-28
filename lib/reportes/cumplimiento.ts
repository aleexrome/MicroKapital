import type { Goal, LoanStatus, LoanType, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { loanNotDeletedWhere, scopedLoanWhere, type AccessUser } from '@/lib/access'
import {
  getCobranzaSnapshot,
  getCobranzaEsperada,
  getColocacionSnapshot,
  getMoraSnapshot,
} from './queries'
import { type DateRange } from './dateRanges'

export interface KpiCumplimiento {
  clave:
    | 'capitalColocado'
    | 'creditosColocados'
    | 'cobranzaEsperada'
    | 'cobranzaEfectiva'
    | 'moraMaxima'
    | 'crecimiento'
  label: string
  meta: number
  real: number
  unidad: 'monto' | 'count' | 'porcentaje'
  // Mora máxima funciona "al revés": real ≤ meta es bueno
  esInverso?: boolean
  cumplido: boolean
  porcentaje: number   // 0..100 (puede pasar 100 si supera la meta)
}

export interface CumplimientoMeta {
  goal: {
    id: string
    branchId: string | null
    branchNombre: string | null
    cobradorId: string | null
    cobradorNombre: string | null
    loanType: LoanType | null
    semanaInicio: Date
    semanaFin: Date
  }
  kpis: KpiCumplimiento[]
  // Promedio simple de los porcentajes de cumplimiento de KPIs definidos
  porcentajeGlobal: number
}

/**
 * Calcula el avance real para los KPIs de una meta. Optimiza ejecutando
 * los snapshots completos UNA vez por toda la lista de metas activas en
 * la semana, y luego filtra en memoria por meta.
 */
export async function evaluarCumplimientoSemanal(
  user: AccessUser,
  companyId: string,
  goals: Goal[],
  range: DateRange,
): Promise<CumplimientoMeta[]> {
  if (goals.length === 0) return []

  const [colocacion, cobranzaReal, cobranzaEsperada, mora, branches, cobradores, carteraInicio, carteraActual] = await Promise.all([
    getColocacionSnapshot(user, companyId, range),
    getCobranzaSnapshot(user, companyId, range),
    getCobranzaEsperada(user, companyId, range),
    getMoraSnapshot(user, companyId),
    prisma.branch.findMany({ where: { companyId }, select: { id: true, nombre: true } }),
    prisma.user.findMany({ where: { companyId }, select: { id: true, nombre: true } }),
    getCarteraAlMomento(user, companyId, range.inicio),
    getCarteraAlMomento(user, companyId, new Date()),
  ])

  const branchMap = new Map(branches.map((b) => [b.id, b.nombre]))
  const cobradorMap = new Map(cobradores.map((c) => [c.id, c.nombre]))

  return goals.map((goal): CumplimientoMeta => {
    // ─── Capital y créditos colocados ───
    let realCapitalColocado: number
    let realCreditosColocados: number
    if (goal.cobradorId) {
      const r = colocacion.porCobrador.find((x) => x.cobradorId === goal.cobradorId)
      realCapitalColocado = r?.capital ?? 0
      realCreditosColocados = r?.numCreditos ?? 0
    } else if (goal.branchId) {
      const r = colocacion.porSucursal.find((x) => x.branchId === goal.branchId)
      realCapitalColocado = r?.capital ?? 0
      realCreditosColocados = r?.numCreditos ?? 0
    } else if (goal.loanType) {
      const r = colocacion.porTipo.find((x) => x.tipo === goal.loanType)
      realCapitalColocado = r?.capital ?? 0
      realCreditosColocados = r?.numCreditos ?? 0
    } else {
      realCapitalColocado = colocacion.totalCapital
      realCreditosColocados = colocacion.numCreditos
    }

    // ─── Cobranza efectiva ───
    let realCobranzaEfectiva: number
    if (goal.cobradorId) {
      realCobranzaEfectiva = cobranzaReal.porCobrador.find((r) => r.cobradorId === goal.cobradorId)?.total ?? 0
    } else if (goal.branchId) {
      realCobranzaEfectiva = cobranzaReal.porSucursal.find((r) => r.branchId === goal.branchId)?.total ?? 0
    } else {
      realCobranzaEfectiva = cobranzaReal.total
    }

    // Cobranza esperada solo se evalúa a nivel global (no hay breakdown por
    // cobrador en una sola query agregada). Si el director quiere granularidad
    // que use múltiples metas con scope.
    const realCobranzaEsperada = cobranzaEsperada.total

    // ─── Mora (% sobre cartera) ───
    let realMoraMonto: number
    let realCarteraTotal: number
    if (goal.cobradorId) {
      realMoraMonto = mora.porCobrador.find((r) => r.cobradorId === goal.cobradorId)?.monto ?? 0
      realCarteraTotal = carteraActual.porCobrador.get(goal.cobradorId) ?? 0
    } else if (goal.branchId) {
      realMoraMonto = mora.porSucursal.find((r) => r.branchId === goal.branchId)?.monto ?? 0
      realCarteraTotal = carteraActual.porSucursal.get(goal.branchId) ?? 0
    } else {
      realMoraMonto = mora.total
      realCarteraTotal = carteraActual.total
    }
    const realMoraPct = realCarteraTotal > 0 ? (realMoraMonto / realCarteraTotal) * 100 : 0

    // ─── Crecimiento de cartera ───
    let realCrecimientoPct: number
    if (goal.cobradorId) {
      const ini = carteraInicio.porCobrador.get(goal.cobradorId) ?? 0
      const fin = carteraActual.porCobrador.get(goal.cobradorId) ?? 0
      realCrecimientoPct = ini > 0 ? ((fin - ini) / ini) * 100 : 0
    } else if (goal.branchId) {
      const ini = carteraInicio.porSucursal.get(goal.branchId) ?? 0
      const fin = carteraActual.porSucursal.get(goal.branchId) ?? 0
      realCrecimientoPct = ini > 0 ? ((fin - ini) / ini) * 100 : 0
    } else {
      const ini = carteraInicio.total
      const fin = carteraActual.total
      realCrecimientoPct = ini > 0 ? ((fin - ini) / ini) * 100 : 0
    }

    // ─── Construir KPIs ───
    const kpis: KpiCumplimiento[] = []
    if (goal.metaCapitalColocado != null) {
      kpis.push(buildKpi('capitalColocado', 'Capital colocado', Number(goal.metaCapitalColocado), realCapitalColocado, 'monto'))
    }
    if (goal.metaCreditosColocados != null) {
      kpis.push(buildKpi('creditosColocados', 'Créditos colocados', goal.metaCreditosColocados, realCreditosColocados, 'count'))
    }
    if (goal.metaCobranzaEsperada != null) {
      kpis.push(buildKpi('cobranzaEsperada', 'Cobranza esperada', Number(goal.metaCobranzaEsperada), realCobranzaEsperada, 'monto'))
    }
    if (goal.metaCobranzaEfectiva != null) {
      kpis.push(buildKpi('cobranzaEfectiva', 'Cobranza efectiva', Number(goal.metaCobranzaEfectiva), realCobranzaEfectiva, 'monto'))
    }
    if (goal.metaMoraMaxima != null) {
      kpis.push(buildKpi('moraMaxima', 'Mora máxima', Number(goal.metaMoraMaxima), realMoraPct, 'porcentaje', true))
    }
    if (goal.metaCrecimiento != null) {
      kpis.push(buildKpi('crecimiento', 'Crecimiento empresa', Number(goal.metaCrecimiento), realCrecimientoPct, 'porcentaje'))
    }

    const porcentajeGlobal = kpis.length > 0
      ? kpis.reduce((s, k) => s + Math.min(k.porcentaje, 100), 0) / kpis.length
      : 0

    return {
      goal: {
        id: goal.id,
        branchId: goal.branchId,
        branchNombre: goal.branchId ? branchMap.get(goal.branchId) ?? null : null,
        cobradorId: goal.cobradorId,
        cobradorNombre: goal.cobradorId ? cobradorMap.get(goal.cobradorId) ?? null : null,
        loanType: goal.loanType,
        semanaInicio: goal.semanaInicio,
        semanaFin: goal.semanaFin,
      },
      kpis,
      porcentajeGlobal,
    }
  })
}

function buildKpi(
  clave: KpiCumplimiento['clave'],
  label: string,
  meta: number,
  real: number,
  unidad: KpiCumplimiento['unidad'],
  esInverso = false,
): KpiCumplimiento {
  if (esInverso) {
    const cumplido = real <= meta
    const porcentaje = cumplido
      ? 100
      : meta > 0 && real > 0
        ? Math.max(0, (meta / real) * 100)
        : 0
    return { clave, label, meta, real, unidad, esInverso, cumplido, porcentaje }
  }
  const porcentaje = meta > 0 ? (real / meta) * 100 : 0
  const cumplido = real >= meta
  return { clave, label, meta, real, unidad, esInverso: false, cumplido, porcentaje }
}

/**
 * Cartera ACTIVE por sucursal/cobrador "al momento" indicado.
 * Para fechas pasadas hace una aproximación con datos actuales.
 */
async function getCarteraAlMomento(
  user: AccessUser,
  companyId: string,
  momento: Date,
): Promise<{
  total: number
  porSucursal: Map<string, number>
  porCobrador: Map<string, number>
}> {
  const isPast = momento.getTime() < Date.now() - 60_000
  const scope = scopedLoanWhere(user)

  const ESTADOS_CERRADOS: LoanStatus[] = ['LIQUIDATED', 'RESTRUCTURED', 'DEFAULTED']
  const where: Prisma.LoanWhereInput = isPast
    ? {
        companyId,
        AND: [scope, loanNotDeletedWhere],
        fechaDesembolso: { lt: momento },
        OR: [
          { estado: 'ACTIVE' },
          {
            AND: [
              { estado: { in: ESTADOS_CERRADOS } },
              { updatedAt: { gte: momento } },
            ],
          },
        ],
      }
    : {
        companyId,
        AND: [scope, loanNotDeletedWhere],
        estado: 'ACTIVE',
      }

  const [total, byBranch, byCobrador] = await Promise.all([
    prisma.loan.aggregate({ where, _sum: { capital: true } }),
    prisma.loan.groupBy({ by: ['branchId'], where, _sum: { capital: true } }),
    prisma.loan.groupBy({ by: ['cobradorId'], where, _sum: { capital: true } }),
  ])

  return {
    total: Number(total._sum?.capital ?? 0),
    porSucursal: new Map(byBranch.map((g) => [g.branchId, Number(g._sum?.capital ?? 0)])),
    porCobrador: new Map(byCobrador.map((g) => [g.cobradorId, Number(g._sum?.capital ?? 0)])),
  }
}
