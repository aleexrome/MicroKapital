export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { BancaSucursalFilter } from '@/components/dashboard/BancaSucursalFilter'
import { BancaAddExtraFundButton } from '@/components/dashboard/BancaAddExtraFundButton'
import { BancaDeleteExtraFundButton } from '@/components/dashboard/BancaDeleteExtraFundButton'
import { BancaAddWithdrawalButton } from '@/components/dashboard/BancaAddWithdrawalButton'
import { BancaDeleteWithdrawalButton } from '@/components/dashboard/BancaDeleteWithdrawalButton'
import { formatMoney, formatDate } from '@/lib/utils'
import { toMxYMD, parseMxYMD } from '@/lib/timezone'
import {
  semanasRecientesSatFri,
  getFriday,
  saturdayToId,
  formatWeekLabelSatFri,
} from '@/lib/week-utils'
import { scopedLoanWhere, loanNotDeletedWhere } from '@/lib/access'
import { calcTarifaApertura } from '@/lib/financial-formulas'
import { Landmark, Banknote, TrendingDown, Wallet, PlusCircle, MinusCircle } from 'lucide-react'

// Semanas laborales (sábado→viernes) hacia atrás que se muestran (incluye la actual).
const WEEKS_BACK = 8

// Día calendario CDMX de un timestamp, formateado dd/MM/yyyy.
function diaMx(d: Date): string {
  return formatDate(parseMxYMD(toMxYMD(d)))
}

interface CorteRow {
  key: string
  fecha: Date
  cobrador: string
  efectivo: number
  tarjeta: number
  total: number
}

interface DesembolsoRow {
  id: string
  fecha: Date
  cobrador: string
  cliente: string
  capital: number
  // "cargoApertura" cubre comisión (INDIVIDUAL / FIDUCIARIO) o seguro
  // (SOLIDARIO / ÁGIL). Calculado con calcTarifaApertura para que ambos
  // aparezcan siempre — antes solo mostrábamos loan.comision, que
  // queda en 0 para solidario y ágil (su fee vive en loan.seguro).
  cargoApertura: number
  cargoConcepto: 'COMISION' | 'SEGURO'
  montoReal: number
}

interface AdicionalRow {
  id: string
  fecha: Date
  monto: number
  concepto: string | null
  creadoPor: string
}

interface RetiroRow {
  id: string
  fecha: Date
  monto: number
  concepto: string | null
  creadoPor: string
}

interface BranchAgg {
  branchId: string
  branchName: string
  cortes: Map<string, CorteRow>
  desembolsos: DesembolsoRow[]
  adicionales: AdicionalRow[]
  retiros: RetiroRow[]
  totalCortes: number
  totalDesembolsos: number
  totalAdicional: number
  totalRetiro: number
}

interface WeekAgg {
  key: string
  saturday: Date
  branches: Map<string, BranchAgg>
}

export default async function BancaPage({
  searchParams,
}: {
  searchParams: { sucursal?: string }
}) {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  const { rol, companyId, id: userId } = session.user
  if (!companyId) redirect('/dashboard')

  // Acceso: DG/DC ven todo y pueden agregar/eliminar. Otros usuarios
  // pueden ver /banca en modo solo lectura si tienen bancaViewerBranchId
  // asignado — se les filtra a esa sucursal y se ocultan botones de
  // acción / borrado.
  const esDireccion = rol === 'DIRECTOR_GENERAL' || rol === 'DIRECTOR_COMERCIAL'
  const viewer = esDireccion
    ? null
    : await prisma.user.findUnique({
        where: { id: userId },
        select: { bancaViewerBranchId: true },
      })
  const viewerBranchId = viewer?.bancaViewerBranchId ?? null
  if (!esDireccion && !viewerBranchId) redirect('/dashboard')
  const soloLectura = !esDireccion

  const accessUser = {
    id: session.user.id,
    rol,
    branchId: session.user.branchId,
    zonaBranchIds: session.user.zonaBranchIds,
  }

  // Viewers están forzados a su branch; se ignora ?sucursal= porque no
  // debe poder cambiar el filtro. DG/DC sí respeta el query param.
  const sucursalFilter = soloLectura
    ? viewerBranchId
    : (searchParams.sucursal && searchParams.sucursal !== 'ALL' ? searchParams.sucursal : null)

  // Rango: desde el sábado más antiguo mostrado hasta el viernes de la semana actual.
  const semanas = semanasRecientesSatFri(WEEKS_BACK)
  const periodoStart = semanas[semanas.length - 1]
  const periodoEnd = getFriday(semanas[0])

  const branchWhere = sucursalFilter ? { branchId: sucursalFilter } : {}

  const [branches, pagos, desembolsos, adicionales, retiros] = await Promise.all([
    // Sucursales de la empresa (para el filtro)
    prisma.branch.findMany({
      where: { companyId },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),

    // Cobros del periodo (mismo criterio que "Corte del Día")
    prisma.payment.findMany({
      where: {
        canceledAt: null,
        fechaHora: { gte: periodoStart, lte: periodoEnd },
        loan: {
          companyId,
          AND: [scopedLoanWhere(accessUser), loanNotDeletedWhere],
          ...branchWhere,
        },
      },
      select: {
        id: true,
        monto: true,
        metodoPago: true,
        fechaHora: true,
        cobrador: { select: { id: true, nombre: true } },
        loan: { select: { branch: { select: { id: true, nombre: true } } } },
      },
    }),

    // Desembolsos netos: préstamos desembolsados en el periodo.
    prisma.loan.findMany({
      where: {
        companyId,
        AND: [scopedLoanWhere(accessUser), loanNotDeletedWhere],
        ...branchWhere,
        fechaDesembolso: { gte: periodoStart, lte: periodoEnd },
        estado: { in: ['ACTIVE', 'LIQUIDATED', 'RESTRUCTURED', 'DEFAULTED'] },
      },
      select: {
        id: true,
        tipo: true,
        fechaDesembolso: true,
        capital: true,
        comision: true,
        montoReal: true,
        cobrador: { select: { id: true, nombre: true } },
        client: { select: { nombreCompleto: true } },
        branch: { select: { id: true, nombre: true } },
      },
    }),

    // Aportes adicionales que Dirección envió a las sucursales.
    prisma.branchExtraFund.findMany({
      where: {
        companyId,
        fecha: { gte: periodoStart, lte: periodoEnd },
        ...branchWhere,
      },
      select: {
        id: true,
        fecha: true,
        monto: true,
        concepto: true,
        branch: { select: { id: true, nombre: true } },
        createdBy: { select: { nombre: true } },
      },
      orderBy: { fecha: 'asc' },
    }),

    // Retiros de recurso que Dirección hizo desde las sucursales.
    prisma.branchWithdrawal.findMany({
      where: {
        companyId,
        fecha: { gte: periodoStart, lte: periodoEnd },
        ...branchWhere,
      },
      select: {
        id: true,
        fecha: true,
        monto: true,
        concepto: true,
        branch: { select: { id: true, nombre: true } },
        createdBy: { select: { nombre: true } },
      },
      orderBy: { fecha: 'asc' },
    }),
  ])

  // ── Rangos de cada semana (sáb→vie) para asignar cada registro ──
  const weekRanges = semanas.map((sat) => ({
    sat,
    friday: getFriday(sat),
    key: saturdayToId(sat),
  }))
  function findWeek(t: Date) {
    return weekRanges.find((w) => t >= w.sat && t <= w.friday) ?? null
  }

  const weeks = new Map<string, WeekAgg>()
  function getBranchAgg(weekKey: string, saturday: Date, branchId: string, branchName: string): BranchAgg {
    let week = weeks.get(weekKey)
    if (!week) {
      week = { key: weekKey, saturday, branches: new Map() }
      weeks.set(weekKey, week)
    }
    let branch = week.branches.get(branchId)
    if (!branch) {
      branch = {
        branchId,
        branchName,
        cortes: new Map(),
        desembolsos: [],
        adicionales: [],
        retiros: [],
        totalCortes: 0,
        totalDesembolsos: 0,
        totalAdicional: 0,
        totalRetiro: 0,
      }
      week.branches.set(branchId, branch)
    }
    return branch
  }

  // Cortes: agrupados por (cobrador, día). Solo cuentan efectivo y tarjeta.
  // Las transferencias se excluyen — banca es solo del dinero que se
  // deposita físicamente; las transferencias ya llegan al banco por otro
  // canal y no forman parte del "Neto para banca".
  for (const p of pagos) {
    const cuenta = p.metodoPago === 'CASH' || p.metodoPago === 'CARD'
    if (!cuenta) continue

    const fecha = new Date(p.fechaHora)
    const w = findWeek(fecha)
    if (!w) continue

    const branch = p.loan.branch
    const b = getBranchAgg(w.key, w.sat, branch.id, branch.nombre)

    const dayKey = toMxYMD(fecha)
    const ck = `${p.cobrador.id}|${dayKey}`
    let corte = b.cortes.get(ck)
    if (!corte) {
      corte = {
        key: ck,
        fecha: parseMxYMD(dayKey),
        cobrador: p.cobrador.nombre,
        efectivo: 0,
        tarjeta: 0,
        total: 0,
      }
      b.cortes.set(ck, corte)
    }
    const m = Number(p.monto)
    if (p.metodoPago === 'CASH') corte.efectivo += m
    else corte.tarjeta += m
    corte.total += m
    b.totalCortes += m
  }

  // Desembolsos netos — el fee "cargoApertura" se calcula con la fórmula
  // del producto (comisión para INDIVIDUAL/FIDUCIARIO, seguro para
  // SOLIDARIO/ÁGIL). Antes solo mostrábamos loan.comision y los seguros
  // de solidario/ágil quedaban en $0 en la vista.
  for (const d of desembolsos) {
    if (!d.fechaDesembolso) continue
    const fecha = new Date(d.fechaDesembolso)
    const w = findWeek(fecha)
    if (!w) continue

    const b = getBranchAgg(w.key, w.sat, d.branch.id, d.branch.nombre)
    const capitalNum = Number(d.capital)
    const montoReal = Number(d.montoReal)
    const tarifa = calcTarifaApertura(
      d.tipo as 'SOLIDARIO' | 'INDIVIDUAL' | 'AGIL' | 'FIDUCIARIO',
      capitalNum,
      Number(d.comision),
    )
    b.desembolsos.push({
      id: d.id,
      fecha,
      cobrador: d.cobrador.nombre,
      cliente: d.client.nombreCompleto,
      capital: capitalNum,
      cargoApertura: tarifa.monto,
      cargoConcepto: tarifa.concepto,
      montoReal,
    })
    b.totalDesembolsos += montoReal
  }

  // Aportes adicionales de Dirección — se suman al saldo bancable.
  for (const a of adicionales) {
    const fecha = new Date(a.fecha)
    const w = findWeek(fecha)
    if (!w) continue

    const b = getBranchAgg(w.key, w.sat, a.branch.id, a.branch.nombre)
    const monto = Number(a.monto)
    b.adicionales.push({
      id: a.id,
      fecha,
      monto,
      concepto: a.concepto,
      creadoPor: a.createdBy?.nombre ?? '—',
    })
    b.totalAdicional += monto
  }

  // Retiros de Dirección — se restan del saldo bancable.
  for (const r of retiros) {
    const fecha = new Date(r.fecha)
    const w = findWeek(fecha)
    if (!w) continue

    const b = getBranchAgg(w.key, w.sat, r.branch.id, r.branch.nombre)
    const monto = Number(r.monto)
    b.retiros.push({
      id: r.id,
      fecha,
      monto,
      concepto: r.concepto,
      creadoPor: r.createdBy?.nombre ?? '—',
    })
    b.totalRetiro += monto
  }

  const weeksSorted = Array.from(weeks.values()).sort(
    (a, b) => b.saturday.getTime() - a.saturday.getTime()
  )

  // Totales del periodo mostrado.
  let grandCortes = 0
  let grandDesembolsos = 0
  let grandAdicional = 0
  let grandRetiro = 0
  for (const w of weeksSorted) {
    for (const b of Array.from(w.branches.values())) {
      grandCortes += b.totalCortes
      grandDesembolsos += b.totalDesembolsos
      grandAdicional += b.totalAdicional
      grandRetiro += b.totalRetiro
    }
  }
  const grandNeto = grandCortes + grandAdicional - grandDesembolsos - grandRetiro

  const sucursalNombre = sucursalFilter
    ? branches.find((b) => b.id === sucursalFilter)?.nombre ?? null
    : null

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Landmark className="h-6 w-6 text-primary-700" />
            Banca
          </h1>
          <p className="text-muted-foreground text-sm">
            Corte semanal (sábado a viernes): cortes del día menos desembolsos netos, por sucursal
            {sucursalNombre ? ` · ${sucursalNombre}` : ' · Empresa completa'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!soloLectura && (
            <>
              <BancaSucursalFilter branches={branches} selected={sucursalFilter ?? 'ALL'} />
              <BancaAddExtraFundButton
                branches={branches}
                defaultBranchId={sucursalFilter ?? undefined}
              />
              <BancaAddWithdrawalButton
                branches={branches}
                defaultBranchId={sucursalFilter ?? undefined}
              />
            </>
          )}
          {soloLectura && (
            <span className="text-xs rounded-full border border-primary-500/40 bg-primary-500/10 text-primary-300 px-2.5 py-1 font-medium">
              Solo lectura · {sucursalNombre}
            </span>
          )}
        </div>
      </div>

      {/* Resumen del periodo */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard
          title={`Cortes (últimas ${WEEKS_BACK} sem.)`}
          value={formatMoney(grandCortes)}
          icon={Banknote}
          color="green"
        />
        <MetricCard
          title="Monto adicional"
          value={formatMoney(grandAdicional)}
          icon={PlusCircle}
          color="purple"
        />
        <MetricCard
          title="Retiros de recurso"
          value={formatMoney(grandRetiro)}
          icon={MinusCircle}
          color="red"
        />
        <MetricCard
          title="Desembolsos netos"
          value={formatMoney(grandDesembolsos)}
          icon={TrendingDown}
          color="yellow"
        />
        <MetricCard
          title="Neto para banca"
          value={formatMoney(grandNeto)}
          icon={Wallet}
          color={grandNeto >= 0 ? 'blue' : 'red'}
        />
      </div>

      {weeksSorted.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Sin movimientos en el periodo seleccionado.
          </CardContent>
        </Card>
      ) : (
        weeksSorted.map((week) => {
          const branchesSorted = Array.from(week.branches.values()).sort((a, b) =>
            a.branchName.localeCompare(b.branchName)
          )
          const weekCortes = branchesSorted.reduce((s, b) => s + b.totalCortes, 0)
          const weekDesembolsos = branchesSorted.reduce((s, b) => s + b.totalDesembolsos, 0)
          const weekAdicional = branchesSorted.reduce((s, b) => s + b.totalAdicional, 0)
          const weekRetiro = branchesSorted.reduce((s, b) => s + b.totalRetiro, 0)
          const weekNeto = weekCortes + weekAdicional - weekDesembolsos - weekRetiro

          return (
            <Card key={week.key}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-base">
                  Semana {formatWeekLabelSatFri(week.saturday)}
                </CardTitle>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Neto para banca</p>
                  <p
                    className={`text-lg font-bold money ${
                      weekNeto >= 0 ? 'text-blue-300' : 'text-red-400'
                    }`}
                  >
                    {formatMoney(weekNeto)}
                  </p>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {branchesSorted.map((b) => {
                  const neto = b.totalCortes + b.totalAdicional - b.totalDesembolsos - b.totalRetiro
                  const cortesRows = Array.from(b.cortes.values()).sort(
                    (x, y) => x.fecha.getTime() - y.fecha.getTime() || x.cobrador.localeCompare(y.cobrador)
                  )
                  const desembolsosRows = [...b.desembolsos].sort(
                    (x, y) => x.fecha.getTime() - y.fecha.getTime()
                  )
                  const adicionalRows = [...b.adicionales].sort(
                    (x, y) => x.fecha.getTime() - y.fecha.getTime()
                  )
                  const retiroRows = [...b.retiros].sort(
                    (x, y) => x.fecha.getTime() - y.fecha.getTime()
                  )
                  return (
                    <div key={b.branchId} className="rounded-lg border border-border">
                      {/* Resumen de la sucursal */}
                      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 border-b border-border bg-secondary/40 px-4 py-3">
                        <div className="col-span-2 sm:col-span-1">
                          <p className="text-xs text-muted-foreground">Sucursal</p>
                          <p className="font-semibold text-foreground">🏢 {b.branchName}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Cortes</p>
                          <p className="font-semibold text-green-700 money">{formatMoney(b.totalCortes)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Adicional</p>
                          <p className="font-semibold text-violet-300 money">
                            {b.totalAdicional > 0 ? `+ ${formatMoney(b.totalAdicional)}` : formatMoney(0)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Retiros</p>
                          <p className="font-semibold text-rose-400 money">
                            {b.totalRetiro > 0 ? `- ${formatMoney(b.totalRetiro)}` : formatMoney(0)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Desembolsos</p>
                          <p className="font-semibold text-yellow-600 money">- {formatMoney(b.totalDesembolsos)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Neto</p>
                          <p className={`font-bold money ${neto >= 0 ? 'text-blue-300' : 'text-red-400'}`}>
                            {formatMoney(neto)}
                          </p>
                        </div>
                      </div>

                      {/* Detalle: cortes del día, adicionales, retiros y desembolsos */}
                      <details className="group">
                        <summary className="cursor-pointer select-none px-4 py-2 text-sm font-medium text-white hover:bg-white/5">
                          Ver detalle ({cortesRows.length} cortes · {adicionalRows.length} adicionales · {retiroRows.length} retiros · {desembolsosRows.length} desembolsos)
                        </summary>
                        <div className="space-y-4 px-4 py-3">
                          {/* Cortes del día */}
                          <div>
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Cortes del día
                            </p>
                            {cortesRows.length === 0 ? (
                              <p className="text-sm text-muted-foreground">Sin cobros.</p>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="text-left text-xs text-muted-foreground">
                                      <th className="py-1 pr-3 font-medium">Fecha</th>
                                      <th className="py-1 pr-3 font-medium">Cobrador</th>
                                      <th className="py-1 pr-3 text-right font-medium">Efectivo</th>
                                      <th className="py-1 pr-3 text-right font-medium">Tarjeta</th>
                                      <th className="py-1 text-right font-medium">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border/50">
                                    {cortesRows.map((c) => (
                                      <tr key={c.key}>
                                        <td className="py-1.5 pr-3">{formatDate(c.fecha)}</td>
                                        <td className="py-1.5 pr-3">{c.cobrador}</td>
                                        <td className="py-1.5 pr-3 text-right money">{formatMoney(c.efectivo)}</td>
                                        <td className="py-1.5 pr-3 text-right money">{formatMoney(c.tarjeta)}</td>
                                        <td className="py-1.5 text-right font-medium money">{formatMoney(c.total)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>

                          {/* Aportes adicionales de Dirección */}
                          <div>
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Monto adicional
                            </p>
                            {adicionalRows.length === 0 ? (
                              <p className="text-sm text-muted-foreground">Sin aportes.</p>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="text-left text-xs text-muted-foreground">
                                      <th className="py-1 pr-3 font-medium">Fecha</th>
                                      <th className="py-1 pr-3 font-medium">Registrado por</th>
                                      <th className="py-1 pr-3 font-medium">Concepto</th>
                                      <th className="py-1 pr-3 text-right font-medium">Monto</th>
                                      <th className="py-1 text-right font-medium w-8"></th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border/50">
                                    {adicionalRows.map((a) => (
                                      <tr key={a.id}>
                                        <td className="py-1.5 pr-3">{diaMx(a.fecha)}</td>
                                        <td className="py-1.5 pr-3">{a.creadoPor}</td>
                                        <td className="py-1.5 pr-3 text-muted-foreground">{a.concepto ?? '—'}</td>
                                        <td className="py-1.5 pr-3 text-right font-medium text-violet-300 money">
                                          + {formatMoney(a.monto)}
                                        </td>
                                        <td className="py-1.5 text-right">
                                          {!soloLectura && (
                                            <BancaDeleteExtraFundButton
                                              id={a.id}
                                              label={`de ${formatMoney(a.monto)} en ${diaMx(a.fecha)}`}
                                            />
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>

                          {/* Retiros de Dirección */}
                          <div>
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Retiros de recurso
                            </p>
                            {retiroRows.length === 0 ? (
                              <p className="text-sm text-muted-foreground">Sin retiros.</p>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="text-left text-xs text-muted-foreground">
                                      <th className="py-1 pr-3 font-medium">Fecha</th>
                                      <th className="py-1 pr-3 font-medium">Registrado por</th>
                                      <th className="py-1 pr-3 font-medium">Concepto</th>
                                      <th className="py-1 pr-3 text-right font-medium">Monto</th>
                                      <th className="py-1 text-right font-medium w-8"></th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border/50">
                                    {retiroRows.map((r) => (
                                      <tr key={r.id}>
                                        <td className="py-1.5 pr-3">{diaMx(r.fecha)}</td>
                                        <td className="py-1.5 pr-3">{r.creadoPor}</td>
                                        <td className="py-1.5 pr-3 text-muted-foreground">{r.concepto ?? '—'}</td>
                                        <td className="py-1.5 pr-3 text-right font-medium text-rose-400 money">
                                          - {formatMoney(r.monto)}
                                        </td>
                                        <td className="py-1.5 text-right">
                                          {!soloLectura && (
                                            <BancaDeleteWithdrawalButton
                                              id={r.id}
                                              label={`de ${formatMoney(r.monto)} en ${diaMx(r.fecha)}`}
                                            />
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>

                          {/* Desembolsos netos */}
                          <div>
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Desembolsos netos
                            </p>
                            {desembolsosRows.length === 0 ? (
                              <p className="text-sm text-muted-foreground">Sin desembolsos.</p>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="text-left text-xs text-muted-foreground">
                                      <th className="py-1 pr-3 font-medium">Fecha</th>
                                      <th className="py-1 pr-3 font-medium">Cobrador</th>
                                      <th className="py-1 pr-3 font-medium">Cliente</th>
                                      <th className="py-1 pr-3 text-right font-medium">Capital</th>
                                      <th className="py-1 pr-3 text-right font-medium">Comisión / Seguro</th>
                                      <th className="py-1 text-right font-medium">Neto</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border/50">
                                    {desembolsosRows.map((d) => (
                                      <tr key={d.id}>
                                        <td className="py-1.5 pr-3">{diaMx(d.fecha)}</td>
                                        <td className="py-1.5 pr-3">{d.cobrador}</td>
                                        <td className="py-1.5 pr-3">{d.cliente}</td>
                                        <td className="py-1.5 pr-3 text-right money">{formatMoney(d.capital)}</td>
                                        <td
                                          className="py-1.5 pr-3 text-right text-yellow-600 money"
                                          title={d.cargoConcepto === 'SEGURO' ? 'Seguro de apertura' : 'Comisión de apertura'}
                                        >
                                          - {formatMoney(d.cargoApertura)}
                                        </td>
                                        <td className="py-1.5 text-right font-medium money">{formatMoney(d.montoReal)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </div>
                      </details>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )
        })
      )}
    </div>
  )
}
