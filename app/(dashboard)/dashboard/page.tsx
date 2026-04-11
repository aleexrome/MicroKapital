import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { formatMoney, formatDate } from '@/lib/utils'
import {
  Users,
  CreditCard,
  AlertTriangle,
  DollarSign,
  CheckSquare,
  Archive,
  TrendingUp,
  ShieldCheck,
  Percent,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Prisma, type UserRole } from '@prisma/client'
import { LoanStatusChart, MonthPaymentsChart } from '@/components/dashboard/DashboardCharts'

const ESTADO_LABEL: Record<string, string> = {
  ACTIVE: 'Activo',
  PENDING_APPROVAL: 'Pendiente',
  APPROVED: 'Aprobado',
  LIQUIDATED: 'Liquidado',
  REJECTED: 'Rechazado',
}
const ESTADO_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'error' | 'default'> = {
  ACTIVE: 'success',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'info',
  LIQUIDATED: 'info',
  REJECTED: 'error',
}

export default async function DashboardPage() {
  const session = await getSession()
  if (!session?.user || session.user.rol === 'COBRADOR') redirect('/cobros/agenda')

  const { rol, companyId, branchId: userBranchId, id: userId } = session.user

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const isDirector    = rol === 'DIRECTOR_GENERAL' || rol === 'DIRECTOR_COMERCIAL'
  const isGerente     = rol === 'GERENTE_ZONAL' || rol === 'GERENTE'
  const isCoordinador = rol === 'COORDINADOR'

  // ── Scope restrictor ──────────────────────────────────────────────────────────

  const loanScope: Prisma.LoanWhereInput = { companyId: companyId! }

  if (rol === 'GERENTE_ZONAL') {
    const zoneIds = session.user.zonaBranchIds
    if (zoneIds && zoneIds.length > 0) loanScope.branchId = { in: zoneIds }
  } else if (rol === 'GERENTE') {
    if (userBranchId) loanScope.branchId = userBranchId
  } else if (isCoordinador) {
    loanScope.cobradorId = userId
  }

  // ── Common KPIs ───────────────────────────────────────────────────────────────

  // First day of current month
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

  const [
    totalClientes,
    prestamosActivos,
    cobradoHoyAgg,
    carteraVencida,
    pendientesAprobacion,
    capitalActivoAgg,
    liquidadosTotal,
    segurosAgg,
    comisionesAgg,
  ] = await Promise.all([
    prisma.client.count({
      where: {
        companyId: companyId!,
        activo: true,
        ...(isCoordinador ? { cobradorId: userId } : {}),
        ...(rol === 'GERENTE' && userBranchId ? { branchId: userBranchId } : {}),
        ...(rol === 'GERENTE_ZONAL' && session.user.zonaBranchIds?.length
          ? { branchId: { in: session.user.zonaBranchIds } }
          : {}),
      },
    }),
    prisma.loan.count({ where: { ...loanScope, estado: 'ACTIVE' } }),
    prisma.payment.aggregate({
      where: {
        loan: loanScope,
        fechaHora: { gte: today, lt: tomorrow },
      },
      _sum: { monto: true },
    }),
    prisma.paymentSchedule.count({
      where: {
        loan: { ...loanScope, estado: 'ACTIVE' },
        estado: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
        fechaVencimiento: { lt: today },
      },
    }),
    isDirector
      ? prisma.loan.count({ where: { ...loanScope, estado: 'PENDING_APPROVAL' } })
      : Promise.resolve(0),
    prisma.loan.aggregate({
      where: { ...loanScope, estado: 'ACTIVE' },
      _sum: { capital: true },
    }),
    prisma.loan.count({ where: { ...loanScope, estado: 'LIQUIDATED' } }),
    // Seguros cobrados este mes (solo directores)
    isDirector
      ? prisma.loan.aggregate({
          where: { ...loanScope, estado: 'ACTIVE', fechaDesembolso: { gte: firstOfMonth } },
          _sum: { seguro: true },
        }).catch(() => ({ _sum: { seguro: null } }))
      : Promise.resolve({ _sum: { seguro: null } }),
    // Comisiones cobradas este mes (solo directores)
    isDirector
      ? prisma.loan.aggregate({
          where: { ...loanScope, estado: 'ACTIVE', fechaDesembolso: { gte: firstOfMonth } },
          _sum: { comision: true },
        }).catch(() => ({ _sum: { comision: null } }))
      : Promise.resolve({ _sum: { comision: null } }),
  ])

  const cobradoHoy     = Number(cobradoHoyAgg._sum.monto ?? 0)
  const capitalActivo  = Number(capitalActivoAgg._sum.capital ?? 0)
  const totalSeguros   = Number((segurosAgg as { _sum: { seguro: unknown } })._sum.seguro ?? 0)
  const totalComisiones = Number((comisionesAgg as { _sum: { comision: unknown } })._sum.comision ?? 0)

  // ── Role-specific extra data ──────────────────────────────────────────────────

  // Directors: per-branch breakdown
  const branchBreakdown = isDirector
    ? await prisma.branch.findMany({
        where: { companyId: companyId!, activa: true },
        select: {
          id: true,
          nombre: true,
          _count: { select: { loans: { where: { estado: 'ACTIVE' } } } },
          loans: {
            where: { estado: 'ACTIVE' },
            select: { capital: true },
          },
        },
        orderBy: { nombre: 'asc' },
      })
    : []

  // Gerente Zonal: per-coordinator breakdown in zone
  const coordinadorBreakdown = isGerente
    ? await prisma.user.findMany({
        where: {
          companyId: companyId!,
          rol: { in: ['COORDINADOR' as UserRole, 'COBRADOR' as UserRole] },
          activo: true,
          ...(rol === 'GERENTE' && userBranchId ? { branchId: userBranchId } : {}),
          ...(rol === 'GERENTE_ZONAL' && session.user.zonaBranchIds?.length
            ? { branchId: { in: session.user.zonaBranchIds } }
            : {}),
        },
        select: {
          id: true,
          nombre: true,
          loansCobrador: {
            where: { estado: 'ACTIVE' },
            select: { capital: true },
          },
        },
        orderBy: { nombre: 'asc' },
      })
    : []

  // ── Chart data ───────────────────────────────────────────────────────────────
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1)

  const [loanStatusDist, schedPagados, schedVencidos, schedPorCobrar] = await Promise.all([
    // Donut 1: loan distribution by estado
    prisma.loan.groupBy({
      by: ['estado'],
      where: loanScope,
      _count: { _all: true },
    }),
    // Donut 2: this month's schedules — PAID
    prisma.paymentSchedule.count({
      where: {
        loan: { ...loanScope, estado: 'ACTIVE' },
        fechaVencimiento: { gte: firstOfMonth, lt: endOfMonth },
        estado: 'PAID',
      },
    }),
    // Donut 2: this month's schedules — visually overdue (date passed, not paid)
    prisma.paymentSchedule.count({
      where: {
        loan: { ...loanScope, estado: 'ACTIVE' },
        fechaVencimiento: { gte: firstOfMonth, lt: today },
        estado: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
      },
    }),
    // Donut 2: this month's schedules — upcoming (date >= today)
    prisma.paymentSchedule.count({
      where: {
        loan: { ...loanScope, estado: 'ACTIVE' },
        fechaVencimiento: { gte: today, lt: endOfMonth },
        estado: { in: ['PENDING', 'PARTIAL'] },
      },
    }),
  ])

  const loanStatusData = loanStatusDist.map((r) => ({ estado: r.estado, count: r._count._all }))
  const monthPaymentsData = { pagados: schedPagados, vencidos: schedVencidos, porCobrar: schedPorCobrar }

  // Recent loans (scoped)
  const recientes = await prisma.loan.findMany({
    where: loanScope,
    orderBy: { createdAt: 'desc' },
    take: 6,
    select: {
      id: true,
      estado: true,
      capital: true,
      createdAt: true,
      client: { select: { nombreCompleto: true } },
      cobrador: { select: { nombre: true } },
    },
  })

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-muted-foreground">{formatDate(new Date(), "EEEE d 'de' MMMM, yyyy")}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Clientes activos"
          value={totalClientes.toLocaleString('es-MX')}
          icon={Users}
          color="blue"
          href="/clientes"
        />
        <MetricCard
          title="Créditos activos"
          value={prestamosActivos.toLocaleString('es-MX')}
          icon={CreditCard}
          color="purple"
          href="/prestamos?estado=ACTIVE"
        />
        <MetricCard
          title="Cobrado hoy"
          value={formatMoney(cobradoHoy)}
          icon={DollarSign}
          color="green"
          href="/cobros/historial"
        />
        <MetricCard
          title="Pagos vencidos"
          value={carteraVencida.toLocaleString('es-MX')}
          icon={AlertTriangle}
          color="red"
          href="/dashboard/detalle?tipo=pagos_vencidos"
        />
      </div>

      {/* Seguros y comisiones (directors only) */}
      {isDirector && (
        <div className="grid grid-cols-2 gap-4">
          <Link href="/dashboard/detalle?tipo=seguros_mes" className="block">
            <Card className="transition-all hover:shadow-md hover:border-border cursor-pointer">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="bg-indigo-500/15 rounded-xl p-2.5">
                  <ShieldCheck className="h-5 w-5 text-indigo-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Seguros cobrados (este mes)</p>
                  <p className="text-xl font-bold text-indigo-400">{formatMoney(totalSeguros)}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/dashboard/detalle?tipo=comisiones_mes" className="block">
            <Card className="transition-all hover:shadow-md hover:border-border cursor-pointer">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="bg-orange-500/15 rounded-xl p-2.5">
                  <Percent className="h-5 w-5 text-orange-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Comisiones de apertura (este mes)</p>
                  <p className="text-xl font-bold text-orange-400">{formatMoney(totalComisiones)}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      )}

      {/* Secondary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href="/prestamos?estado=ACTIVE" className="block">
          <Card className="transition-all hover:shadow-md hover:border-border cursor-pointer">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="bg-emerald-500/15 rounded-xl p-2.5">
                <TrendingUp className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Capital en cartera</p>
                <p className="text-xl font-bold text-emerald-400">{formatMoney(capitalActivo)}</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/creditos-concluidos" className="block">
          <Card className="transition-all hover:shadow-md hover:border-border cursor-pointer">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="bg-blue-500/15 rounded-xl p-2.5">
                <Archive className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Créditos concluidos</p>
                <p className="text-xl font-bold text-blue-400">{liquidadosTotal.toLocaleString('es-MX')}</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        {isDirector && (
          <Card>
            <CardContent className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="bg-amber-500/15 rounded-xl p-2.5">
                  <CheckSquare className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pendientes de aprobación</p>
                  <p className="text-xl font-bold text-amber-400">{(pendientesAprobacion as number).toLocaleString('es-MX')}</p>
                </div>
              </div>
              {(pendientesAprobacion as number) > 0 && (
                <Button asChild size="sm" variant="outline">
                  <Link href="/prestamos/aprobaciones">Ver</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        )}
        {!isDirector && (
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="bg-slate-500/15 rounded-xl p-2.5">
                <CheckSquare className="h-5 w-5 text-slate-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Eficiencia hoy</p>
                <p className="text-xl font-bold text-gray-700">
                  {carteraVencida === 0 ? '100%' : `${Math.max(0, Math.round(100 - (carteraVencida / Math.max(1, prestamosActivos)) * 100))}%`}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Per-branch breakdown (directors) */}
      {isDirector && branchBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cartera por sucursal</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/40">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Sucursal</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Créditos activos</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Capital activo</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {branchBreakdown.map((branch) => {
                    const cap = branch.loans.reduce((s, l) => s + Number(l.capital), 0)
                    return (
                      <tr key={branch.id} className="hover:bg-muted/30 transition-colors cursor-pointer">
                        <td className="px-4 py-2.5">
                          <Link href={`/cartera/${branch.id}`} className="font-medium hover:underline">
                            {branch.nombre}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-right">{branch._count.loans}</td>
                        <td className="px-4 py-2.5 text-right font-semibold">{formatMoney(cap)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-coordinator breakdown (gerentes) */}
      {isGerente && coordinadorBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cartera por coordinador</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/40">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Coordinador</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Créditos activos</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Capital activo</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {coordinadorBreakdown.map((coord) => {
                    const cap = coord.loansCobrador.reduce((s, l) => s + Number(l.capital), 0)
                    return (
                      <tr key={coord.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5 font-medium">{coord.nombre}</td>
                        <td className="px-4 py-2.5 text-right">{coord.loansCobrador.length}</td>
                        <td className="px-4 py-2.5 text-right font-semibold">{formatMoney(cap)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5">
            <LoanStatusChart data={loanStatusData} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <MonthPaymentsChart data={monthPaymentsData} />
          </CardContent>
        </Card>
      </div>

      {/* Recent loans */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Créditos recientes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {recientes.map((loan) => (
              <Link
                key={loan.id}
                href={`/prestamos/${loan.id}`}
                className="flex items-center justify-between py-2 border-b border-border/50 last:border-0 hover:bg-muted/30 rounded-xl px-2 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium">{loan.client.nombreCompleto}</p>
                  <p className="text-xs text-muted-foreground">
                    {loan.cobrador.nombre} · {formatDate(loan.createdAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{formatMoney(Number(loan.capital))}</p>
                  <Badge variant={ESTADO_VARIANT[loan.estado] ?? 'default'} className="text-xs">
                    {ESTADO_LABEL[loan.estado] ?? loan.estado}
                  </Badge>
                </div>
              </Link>
            ))}
            {recientes.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No hay créditos registrados aún
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
