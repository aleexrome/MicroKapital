import type { Prisma, LoanType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { loanNotDeletedWhere, scopedLoanWhere, type AccessUser } from '@/lib/access'
import { overdueWhere } from '@/lib/schedule'
import { todayMx, startOfDayMx } from '@/lib/timezone'
import { dailyBuckets, type DateRange } from './dateRanges'

/**
 * Filtros que se aplican a todas las consultas de reportes. Se construyen
 * a partir de la barra de filtros (FiltrosBar) y se traducen en `where`
 * de Prisma respetando el scope del usuario.
 */
export interface ReporteFiltros {
  branchIds?: string[]      // multi-select sucursal (null/empty = todas las del scope)
  cobradorIds?: string[]    // multi-select cobrador
  loanTypes?: LoanType[]    // multi-select producto
}

/**
 * Aplica filtros opcionales (sucursal/cobrador/producto) sobre el scope
 * base. El scope siempre manda — los filtros UI sólo pueden restringir más.
 *
 * Combina scope + soft-delete usando `AND` para no perder los OR del
 * scope (ej. GERENTE) al hacer spread. Mismo patrón usado en
 * `cobros/agenda/page.tsx` y `dashboard/page.tsx`.
 */
export function buildLoanWhere(
  user: AccessUser,
  companyId: string,
  filtros: ReporteFiltros = {},
): Prisma.LoanWhereInput {
  const where: Prisma.LoanWhereInput = {
    companyId,
    AND: [scopedLoanWhere(user), loanNotDeletedWhere],
  }
  if (filtros.branchIds?.length)   where.branchId   = { in: filtros.branchIds }
  if (filtros.cobradorIds?.length) where.cobradorId = { in: filtros.cobradorIds }
  if (filtros.loanTypes?.length)   where.tipo       = { in: filtros.loanTypes }
  return where
}

// ─── Cartera activa ──────────────────────────────────────────────

export interface CarteraSnapshot {
  totalCapital: number    // suma de capital de loans ACTIVE
  totalSaldoTeorico: number  // suma de totalPago (capital + interés)
  numCreditos: number
  porTipo: Array<{ tipo: LoanType; capital: number; numCreditos: number }>
  porSucursal: Array<{ branchId: string; nombre: string; capital: number; numCreditos: number }>
  porCobrador: Array<{ cobradorId: string; nombre: string; capital: number; numCreditos: number }>
}

export async function getCarteraSnapshot(
  user: AccessUser,
  companyId: string,
  filtros: ReporteFiltros = {},
): Promise<CarteraSnapshot> {
  const where: Prisma.LoanWhereInput = { ...buildLoanWhere(user, companyId, filtros), estado: 'ACTIVE' }

  const [totales, byTipo, byBranch, byCobrador, branches, cobradores] = await Promise.all([
    prisma.loan.aggregate({
      where,
      _sum: { capital: true, totalPago: true },
      _count: true,
    }),
    prisma.loan.groupBy({
      by: ['tipo'],
      where,
      _sum: { capital: true },
      _count: true,
    }),
    prisma.loan.groupBy({
      by: ['branchId'],
      where,
      _sum: { capital: true },
      _count: true,
    }),
    prisma.loan.groupBy({
      by: ['cobradorId'],
      where,
      _sum: { capital: true },
      _count: true,
    }),
    prisma.branch.findMany({
      where: { companyId },
      select: { id: true, nombre: true },
    }),
    prisma.user.findMany({
      where: { companyId },
      select: { id: true, nombre: true },
    }),
  ])

  const branchMap = new Map(branches.map((b) => [b.id, b.nombre]))
  const cobradorMap = new Map(cobradores.map((c) => [c.id, c.nombre]))

  return {
    totalCapital: Number(totales._sum.capital ?? 0),
    totalSaldoTeorico: Number(totales._sum.totalPago ?? 0),
    numCreditos: totales._count,
    porTipo: byTipo.map((g) => ({
      tipo: g.tipo,
      capital: Number(g._sum.capital ?? 0),
      numCreditos: g._count,
    })),
    porSucursal: byBranch
      .map((g) => ({
        branchId: g.branchId,
        nombre: branchMap.get(g.branchId) ?? '—',
        capital: Number(g._sum.capital ?? 0),
        numCreditos: g._count,
      }))
      .sort((a, b) => b.capital - a.capital),
    porCobrador: byCobrador
      .map((g) => ({
        cobradorId: g.cobradorId,
        nombre: cobradorMap.get(g.cobradorId) ?? '—',
        capital: Number(g._sum.capital ?? 0),
        numCreditos: g._count,
      }))
      .sort((a, b) => b.capital - a.capital),
  }
}

// ─── Cobranza efectiva en periodo ─────────────────────────────────

export interface CobranzaSnapshot {
  total: number
  efectivo: number
  tarjeta: number
  transferenciaVerificada: number
  transferenciaPendiente: number
  numPagos: number
  porDia: Array<{ label: string; total: number; efectivo: number; tarjeta: number; transferencia: number }>
  porSucursal: Array<{ branchId: string; nombre: string; total: number; numPagos: number }>
  porCobrador: Array<{ cobradorId: string; nombre: string; total: number; numPagos: number }>
}

export async function getCobranzaSnapshot(
  user: AccessUser,
  companyId: string,
  range: DateRange,
  filtros: ReporteFiltros = {},
): Promise<CobranzaSnapshot> {
  const loanWhere = buildLoanWhere(user, companyId, filtros)
  const paymentWhere: Prisma.PaymentWhereInput = {
    fechaHora: { gte: range.inicio, lte: range.fin },
    loan: loanWhere,
    OR: [
      { metodoPago: { in: ['CASH', 'CARD'] } },
      { AND: [{ metodoPago: 'TRANSFER' }, { statusTransferencia: 'VERIFICADO' }] },
    ],
  }

  const [pagos, transfPendientes, branches, cobradores] = await Promise.all([
    prisma.payment.findMany({
      where: paymentWhere,
      select: {
        monto: true,
        metodoPago: true,
        fechaHora: true,
        cobradorId: true,
        loan: { select: { branchId: true } },
      },
    }),
    prisma.payment.aggregate({
      where: {
        fechaHora: { gte: range.inicio, lte: range.fin },
        loan: loanWhere,
        metodoPago: 'TRANSFER',
        OR: [{ statusTransferencia: { not: 'VERIFICADO' } }, { statusTransferencia: null }],
      },
      _sum: { monto: true },
    }),
    prisma.branch.findMany({ where: { companyId }, select: { id: true, nombre: true } }),
    prisma.user.findMany({ where: { companyId }, select: { id: true, nombre: true } }),
  ])

  let efectivo = 0, tarjeta = 0, transferencia = 0
  const buckets = dailyBuckets(range)
  const dayMap = new Map(
    buckets.map((b) => [
      b.label,
      { label: b.label, total: 0, efectivo: 0, tarjeta: 0, transferencia: 0 },
    ]),
  )
  const branchAcc = new Map<string, { total: number; numPagos: number }>()
  const cobradorAcc = new Map<string, { total: number; numPagos: number }>()

  function bucketLabelFor(d: Date): string {
    const fmt = new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: '2-digit' })
    return fmt.format(d).replace('.', '')
  }

  for (const p of pagos) {
    const monto = Number(p.monto)
    if (p.metodoPago === 'CASH')        efectivo      += monto
    else if (p.metodoPago === 'CARD')   tarjeta       += monto
    else                                 transferencia += monto

    const dayLabel = bucketLabelFor(p.fechaHora)
    const day = dayMap.get(dayLabel)
    if (day) {
      day.total += monto
      if (p.metodoPago === 'CASH')      day.efectivo      += monto
      else if (p.metodoPago === 'CARD') day.tarjeta       += monto
      else                              day.transferencia += monto
    }

    const branchId = p.loan.branchId
    const ba = branchAcc.get(branchId) ?? { total: 0, numPagos: 0 }
    ba.total += monto; ba.numPagos += 1
    branchAcc.set(branchId, ba)

    const ca = cobradorAcc.get(p.cobradorId) ?? { total: 0, numPagos: 0 }
    ca.total += monto; ca.numPagos += 1
    cobradorAcc.set(p.cobradorId, ca)
  }

  const branchMap = new Map(branches.map((b) => [b.id, b.nombre]))
  const cobradorMap = new Map(cobradores.map((c) => [c.id, c.nombre]))

  return {
    total: efectivo + tarjeta + transferencia,
    efectivo,
    tarjeta,
    transferenciaVerificada: transferencia,
    transferenciaPendiente: Number(transfPendientes._sum.monto ?? 0),
    numPagos: pagos.length,
    porDia: Array.from(dayMap.values()),
    porSucursal: Array.from(branchAcc.entries())
      .map(([id, acc]) => ({ branchId: id, nombre: branchMap.get(id) ?? '—', ...acc }))
      .sort((a, b) => b.total - a.total),
    porCobrador: Array.from(cobradorAcc.entries())
      .map(([id, acc]) => ({ cobradorId: id, nombre: cobradorMap.get(id) ?? '—', ...acc }))
      .sort((a, b) => b.total - a.total),
  }
}

// ─── Cobranza esperada (lo que DEBÍA cobrarse en el periodo) ────────

export async function getCobranzaEsperada(
  user: AccessUser,
  companyId: string,
  range: DateRange,
  filtros: ReporteFiltros = {},
): Promise<{ total: number; numSchedules: number }> {
  const loanWhere = buildLoanWhere(user, companyId, filtros)
  const agg = await prisma.paymentSchedule.aggregate({
    where: {
      loan: loanWhere,
      fechaVencimiento: { gte: range.inicio, lte: range.fin },
      // Excluimos FINANCIADO porque esos pagos los cubre la renovación,
      // no son cobranza esperada del periodo.
      estado: { not: 'FINANCIADO' },
    },
    _sum: { montoEsperado: true },
    _count: true,
  })
  return {
    total: Number(agg._sum.montoEsperado ?? 0),
    numSchedules: agg._count,
  }
}

// ─── Mora — buckets 1-7, 8-15, 16+ ─────────────────────────────────

export interface MoraSnapshot {
  total: number
  numSchedules: number
  numClientes: number
  buckets: { rango: '1-7' | '8-15' | '16+'; monto: number; count: number }[]
  porSucursal: Array<{ branchId: string; nombre: string; monto: number; count: number }>
  porCobrador: Array<{ cobradorId: string; nombre: string; monto: number; count: number }>
}

export async function getMoraSnapshot(
  user: AccessUser,
  companyId: string,
  filtros: ReporteFiltros = {},
): Promise<MoraSnapshot> {
  const today = todayMx()
  const loanWhere = buildLoanWhere(user, companyId, filtros)

  const overdues = await prisma.paymentSchedule.findMany({
    where: {
      ...overdueWhere(today),
      loan: loanWhere,
    },
    select: {
      fechaVencimiento: true,
      montoEsperado: true,
      montoPagado: true,
      loan: {
        select: {
          branchId: true,
          cobradorId: true,
          clientId: true,
        },
      },
    },
  })

  const [branches, cobradores] = await Promise.all([
    prisma.branch.findMany({ where: { companyId }, select: { id: true, nombre: true } }),
    prisma.user.findMany({ where: { companyId }, select: { id: true, nombre: true } }),
  ])
  const branchMap = new Map(branches.map((b) => [b.id, b.nombre]))
  const cobradorMap = new Map(cobradores.map((c) => [c.id, c.nombre]))

  const buckets = {
    '1-7':  { monto: 0, count: 0 },
    '8-15': { monto: 0, count: 0 },
    '16+':  { monto: 0, count: 0 },
  }
  const branchAcc = new Map<string, { monto: number; count: number }>()
  const cobradorAcc = new Map<string, { monto: number; count: number }>()
  const clientesUnicos = new Set<string>()
  let total = 0

  for (const s of overdues) {
    const dueDate = startOfDayMx(new Date(s.fechaVencimiento))
    const diasAtraso = Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000)
    const pendiente = Number(s.montoEsperado) - Number(s.montoPagado)
    if (pendiente <= 0) continue
    total += pendiente
    clientesUnicos.add(s.loan.clientId)

    const bucketKey = diasAtraso <= 7 ? '1-7' : diasAtraso <= 15 ? '8-15' : '16+'
    buckets[bucketKey].monto += pendiente
    buckets[bucketKey].count += 1

    const ba = branchAcc.get(s.loan.branchId) ?? { monto: 0, count: 0 }
    ba.monto += pendiente; ba.count += 1
    branchAcc.set(s.loan.branchId, ba)

    const ca = cobradorAcc.get(s.loan.cobradorId) ?? { monto: 0, count: 0 }
    ca.monto += pendiente; ca.count += 1
    cobradorAcc.set(s.loan.cobradorId, ca)
  }

  return {
    total,
    numSchedules: overdues.length,
    numClientes: clientesUnicos.size,
    buckets: [
      { rango: '1-7',  ...buckets['1-7']  },
      { rango: '8-15', ...buckets['8-15'] },
      { rango: '16+',  ...buckets['16+']  },
    ],
    porSucursal: Array.from(branchAcc.entries())
      .map(([id, acc]) => ({ branchId: id, nombre: branchMap.get(id) ?? '—', ...acc }))
      .sort((a, b) => b.monto - a.monto),
    porCobrador: Array.from(cobradorAcc.entries())
      .map(([id, acc]) => ({ cobradorId: id, nombre: cobradorMap.get(id) ?? '—', ...acc }))
      .sort((a, b) => b.monto - a.monto),
  }
}

// ─── Colocación (créditos desembolsados en periodo) ─────────────────

export interface ColocacionSnapshot {
  totalCapital: number
  numCreditos: number
  porTipo: Array<{ tipo: LoanType; capital: number; numCreditos: number }>
  porSucursal: Array<{ branchId: string; nombre: string; capital: number; numCreditos: number }>
  porCobrador: Array<{ cobradorId: string; nombre: string; capital: number; numCreditos: number }>
}

export async function getColocacionSnapshot(
  user: AccessUser,
  companyId: string,
  range: DateRange,
  filtros: ReporteFiltros = {},
): Promise<ColocacionSnapshot> {
  const loanWhere = buildLoanWhere(user, companyId, filtros)
  const where: Prisma.LoanWhereInput = {
    ...loanWhere,
    fechaDesembolso: { gte: range.inicio, lte: range.fin },
    estado: { in: ['ACTIVE', 'LIQUIDATED', 'RESTRUCTURED', 'DEFAULTED'] },
  }
  const [totales, byTipo, byBranch, byCobrador, branches, cobradores] = await Promise.all([
    prisma.loan.aggregate({ where, _sum: { capital: true }, _count: true }),
    prisma.loan.groupBy({ by: ['tipo'],     where, _sum: { capital: true }, _count: true }),
    prisma.loan.groupBy({ by: ['branchId'], where, _sum: { capital: true }, _count: true }),
    prisma.loan.groupBy({ by: ['cobradorId'], where, _sum: { capital: true }, _count: true }),
    prisma.branch.findMany({ where: { companyId }, select: { id: true, nombre: true } }),
    prisma.user.findMany({ where: { companyId }, select: { id: true, nombre: true } }),
  ])
  const branchMap = new Map(branches.map((b) => [b.id, b.nombre]))
  const cobradorMap = new Map(cobradores.map((c) => [c.id, c.nombre]))
  return {
    totalCapital: Number(totales._sum.capital ?? 0),
    numCreditos: totales._count,
    porTipo: byTipo.map((g) => ({ tipo: g.tipo, capital: Number(g._sum.capital ?? 0), numCreditos: g._count })),
    porSucursal: byBranch
      .map((g) => ({ branchId: g.branchId, nombre: branchMap.get(g.branchId) ?? '—', capital: Number(g._sum.capital ?? 0), numCreditos: g._count }))
      .sort((a, b) => b.capital - a.capital),
    porCobrador: byCobrador
      .map((g) => ({ cobradorId: g.cobradorId, nombre: cobradorMap.get(g.cobradorId) ?? '—', capital: Number(g._sum.capital ?? 0), numCreditos: g._count }))
      .sort((a, b) => b.capital - a.capital),
  }
}

// ─── Liquidaciones ─────────────────────────────────────────────────

export interface LiquidacionesSnapshot {
  numLiquidados: number
  capitalLiquidado: number
  porTipo: Array<{ tipo: LoanType; numLiquidados: number; capital: number }>
  ultimos: Array<{
    id: string
    cliente: string
    tipo: LoanType
    capital: number
    fechaDesembolso: Date | null
    liquidadoEn: Date
  }>
}

export async function getLiquidacionesSnapshot(
  user: AccessUser,
  companyId: string,
  range: DateRange,
  filtros: ReporteFiltros = {},
): Promise<LiquidacionesSnapshot> {
  const loanWhere = buildLoanWhere(user, companyId, filtros)
  const where: Prisma.LoanWhereInput = {
    ...loanWhere,
    estado: 'LIQUIDATED',
    updatedAt: { gte: range.inicio, lte: range.fin },
  }
  const [totales, byTipo, ultimos] = await Promise.all([
    prisma.loan.aggregate({ where, _sum: { capital: true }, _count: true }),
    prisma.loan.groupBy({ by: ['tipo'], where, _sum: { capital: true }, _count: true }),
    prisma.loan.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        tipo: true,
        capital: true,
        fechaDesembolso: true,
        updatedAt: true,
        client: { select: { nombreCompleto: true } },
      },
    }),
  ])
  return {
    numLiquidados: totales._count,
    capitalLiquidado: Number(totales._sum.capital ?? 0),
    porTipo: byTipo.map((g) => ({ tipo: g.tipo, numLiquidados: g._count, capital: Number(g._sum.capital ?? 0) })),
    ultimos: ultimos.map((l) => ({
      id: l.id,
      cliente: l.client.nombreCompleto,
      tipo: l.tipo,
      capital: Number(l.capital),
      fechaDesembolso: l.fechaDesembolso,
      liquidadoEn: l.updatedAt,
    })),
  }
}

// ─── Crecimiento de cartera (semana actual vs anterior) ─────────────

export async function getCrecimientoCartera(
  user: AccessUser,
  companyId: string,
  filtros: ReporteFiltros = {},
): Promise<{
  carteraActual: number
  carteraSemanaAnterior: number
  crecimientoPct: number
}> {
  const loanWhere = buildLoanWhere(user, companyId, filtros)
  const now = new Date()
  const haceUnaSemana = new Date(now)
  haceUnaSemana.setDate(haceUnaSemana.getDate() - 7)

  // Cartera actual: capital de loans ACTIVE ahora
  const actual = await prisma.loan.aggregate({
    where: { ...loanWhere, estado: 'ACTIVE' },
    _sum: { capital: true },
  })
  // Cartera "hace 1 semana" aproximada: loans desembolsados antes de esa
  // fecha y que no fueron liquidados/rechazados antes de esa fecha
  // tampoco. Es una aproximación razonable con los datos que hay.
  const anterior = await prisma.loan.aggregate({
    where: {
      ...loanWhere,
      fechaDesembolso: { lt: haceUnaSemana },
      OR: [
        { estado: 'ACTIVE' },
        { AND: [{ estado: { in: ['LIQUIDATED', 'RESTRUCTURED', 'DEFAULTED'] } }, { updatedAt: { gte: haceUnaSemana } }] },
      ],
    },
    _sum: { capital: true },
  })

  const carteraActual = Number(actual._sum.capital ?? 0)
  const carteraSemanaAnterior = Number(anterior._sum.capital ?? 0)
  const crecimientoPct = carteraSemanaAnterior > 0
    ? ((carteraActual - carteraSemanaAnterior) / carteraSemanaAnterior) * 100
    : 0

  return { carteraActual, carteraSemanaAnterior, crecimientoPct }
}

// ─── Helper: branches y cobradores visibles para los filtros ─────────

export async function getFiltrosOpciones(user: AccessUser, companyId: string) {
  // Sucursales que el usuario puede ver (mismo criterio que el scope)
  const branchWhere: Prisma.BranchWhereInput = { companyId, activa: true }
  if (user.rol === 'COORDINADOR' || user.rol === 'COBRADOR') {
    if (user.branchId) branchWhere.id = user.branchId
    else branchWhere.id = '__NO_BRANCH_ASSIGNED__'
  } else if (user.rol === 'GERENTE_ZONAL' || user.rol === 'GERENTE') {
    const ids = user.zonaBranchIds?.length
      ? user.zonaBranchIds
      : user.branchId
        ? [user.branchId]
        : []
    branchWhere.id = ids.length ? { in: ids } : '__NO_BRANCH_ASSIGNED__'
  }

  // Cobradores visibles: si el usuario es coordinador/cobrador → solo él
  // mismo. Si es gerente → cobradores de su zona. DG/DC ven todos.
  const cobradorWhere: Prisma.UserWhereInput = {
    companyId,
    rol: { in: ['COBRADOR', 'COORDINADOR', 'GERENTE', 'GERENTE_ZONAL'] },
    activo: true,
  }
  if (user.rol === 'COORDINADOR' || user.rol === 'COBRADOR') {
    cobradorWhere.id = user.id
  } else if (user.rol === 'GERENTE_ZONAL' || user.rol === 'GERENTE') {
    const ids = user.zonaBranchIds?.length
      ? user.zonaBranchIds
      : user.branchId
        ? [user.branchId]
        : []
    if (ids.length) cobradorWhere.branchId = { in: ids }
    else cobradorWhere.id = '__NO_BRANCH_ASSIGNED__'
  }

  const [branches, cobradores] = await Promise.all([
    prisma.branch.findMany({
      where: branchWhere,
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),
    prisma.user.findMany({
      where: cobradorWhere,
      select: { id: true, nombre: true, branchId: true, rol: true },
      orderBy: { nombre: 'asc' },
    }),
  ])
  return { branches, cobradores }
}
