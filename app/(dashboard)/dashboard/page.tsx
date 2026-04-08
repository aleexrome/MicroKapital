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
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Prisma, type UserRole } from '@prisma/client'

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

  const [
    totalClientes,
    prestamosActivos,
    cobradoHoyAgg,
    carteraVencida,
    pendientesAprobacion,
    capitalActivoAgg,
    liquidadosTotal,
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
      where: { loan: { ...loanScope, estado: 'ACTIVE' }, estado: 'OVERDUE' },
    }),
    isDirector
      ? prisma.loan.count({ where: { ...loanScope, estado: 'PENDING_APPROVAL' } })
      : Promise.resolve(0),
    prisma.loan.aggregate({
      where: { ...loanScope, estado: 'ACTIVE' },
      _sum: { capital: true },
    }),
    prisma.loan.count({ where: { ...loanScope, estado: 'LIQUIDATED' } }),
  ])

  const cobradoHoy     = Number(cobradoHoyAgg._sum.monto ?? 0)
  const capitalActivo  = Number(capitalActivoAgg._sum.capital ?? 0)

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

  // Recent loans (scoped)
  const recientes = await prisma.loan.findMany({
    where: loanScope,
    orderBy: { createdAt: 'desc' },
    take: 6,
    include: {
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
        />
        <MetricCard
          title="Créditos activos"
          value={prestamosActivos.toLocaleString('es-MX')}
          icon={CreditCard}
          color="purple"
        />
        <MetricCard
          title="Cobrado hoy"
          value={formatMoney(cobradoHoy)}
          icon={DollarSign}
          color="green"
        />
        <MetricCard
          title="Pagos vencidos"
          value={carteraVencida.toLocaleString('es-MX')}
          icon={AlertTriangle}
          color="red"
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="bg-green-100 rounded-lg p-2.5">
              <TrendingUp className="h-5 w-5 text-green-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Capital en cartera</p>
              <p className="text-xl font-bold text-green-700">{formatMoney(capitalActivo)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="bg-blue-100 rounded-lg p-2.5">
              <Archive className="h-5 w-5 text-blue-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Créditos concluidos</p>
              <p className="text-xl font-bold text-blue-700">{liquidadosTotal.toLocaleString('es-MX')}</p>
            </div>
          </CardContent>
        </Card>
        {isDirector && (
          <Card>
            <CardContent className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="bg-amber-100 rounded-lg p-2.5">
                  <CheckSquare className="h-5 w-5 text-amber-700" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pendientes de aprobación</p>
                  <p className="text-xl font-bold text-amber-700">{(pendientesAprobacion as number).toLocaleString('es-MX')}</p>
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
              <div className="bg-gray-100 rounded-lg p-2.5">
                <CheckSquare className="h-5 w-5 text-gray-600" />
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
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Sucursal</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Créditos activos</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Capital activo</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {branchBreakdown.map((branch) => {
                    const cap = branch.loans.reduce((s, l) => s + Number(l.capital), 0)
                    return (
                      <tr key={branch.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium">{branch.nombre}</td>
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
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Coordinador</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Créditos activos</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Capital activo</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {coordinadorBreakdown.map((coord) => {
                    const cap = coord.loansCobrador.reduce((s, l) => s + Number(l.capital), 0)
                    return (
                      <tr key={coord.id} className="hover:bg-gray-50">
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
                className="flex items-center justify-between py-2 border-b last:border-0 hover:bg-gray-50 rounded px-1 transition-colors"
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
