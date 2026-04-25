export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { formatMoney } from '@/lib/utils'
import { DollarSign, Users, TrendingDown, CheckCircle } from 'lucide-react'
import { scopedLoanWhere, scopedCashRegisterWhere } from '@/lib/access'

const ALLOWED_ROLES = [
  'SUPER_ADMIN',
  'DIRECTOR_GENERAL',
  'DIRECTOR_COMERCIAL',
  'GERENTE_ZONAL',
  'GERENTE',
  'COORDINADOR',
  'COBRADOR',
] as const

const GLOBAL_ROLES = ['SUPER_ADMIN', 'DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL'] as const
const BRANCH_ROLES = ['GERENTE_ZONAL', 'GERENTE'] as const

export default async function ReportesPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  const { rol, companyId } = session.user
  if (!ALLOWED_ROLES.includes(rol as typeof ALLOWED_ROLES[number])) redirect('/dashboard')

  const accessUser = {
    id: session.user.id,
    rol,
    branchId: session.user.branchId,
    zonaBranchIds: session.user.zonaBranchIds,
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1)

  const loanScope = scopedLoanWhere(accessUser)
  const cashScope = scopedCashRegisterWhere(accessUser)

  const [
    totalCartera,
    cashMesAgg,
    moraCount,
    liquidadosMes,
  ] = await Promise.all([
    prisma.loan.aggregate({
      where: { companyId: companyId!, estado: 'ACTIVE', ...loanScope },
      _sum: { totalPago: true },
    }),

    prisma.cashRegister.aggregate({
      where: {
        branch: { companyId: companyId! },
        fecha: { gte: startOfMonth, lt: endOfMonth },
        ...cashScope,
      },
      _sum: {
        cobradoEfectivo:      true,
        cobradoTarjeta:       true,
        cobradoTransferencia: true,
      },
    }),

    prisma.paymentSchedule.count({
      where: {
        loan: { companyId: companyId!, estado: 'ACTIVE', ...loanScope },
        estado: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
        fechaVencimiento: { lt: today },
      },
    }),

    prisma.loan.count({
      where: {
        companyId: companyId!,
        estado: 'LIQUIDATED',
        updatedAt: { gte: startOfMonth },
        ...loanScope,
      },
    }),
  ])

  const cobradoMes =
    Number(cashMesAgg._sum.cobradoEfectivo      ?? 0) +
    Number(cashMesAgg._sum.cobradoTarjeta       ?? 0) +
    Number(cashMesAgg._sum.cobradoTransferencia ?? 0)

  const isGlobal = (GLOBAL_ROLES as readonly string[]).includes(rol)
  const isBranch = (BRANCH_ROLES as readonly string[]).includes(rol)
  const subtitulo = isGlobal
    ? 'Indicadores del mes en curso · Toda la empresa'
    : isBranch
      ? 'Indicadores del mes en curso · Sucursal'
      : 'Indicadores del mes en curso · Mis datos'

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
        <p className="text-muted-foreground">{subtitulo}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Cartera total activa"
          value={formatMoney(Number(totalCartera._sum.totalPago ?? 0))}
          icon={DollarSign}
          color="blue"
        />
        <MetricCard
          title="Cobrado este mes"
          value={formatMoney(cobradoMes)}
          icon={TrendingDown}
          color="green"
        />
        <MetricCard
          title="Pagos en mora"
          value={moraCount.toLocaleString()}
          icon={Users}
          color="red"
        />
        <MetricCard
          title="Liquidados este mes"
          value={liquidadosMes.toLocaleString()}
          icon={CheckCircle}
          color="purple"
        />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Módulo de reportes</CardTitle></CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Los reportes detallados (cobranza por cobrador, mora por edad, cartera en riesgo)
            están disponibles en la siguiente fase de implementación.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
