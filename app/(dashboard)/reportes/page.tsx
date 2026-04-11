export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { formatMoney } from '@/lib/utils'
import { DollarSign, Users, TrendingDown, CheckCircle } from 'lucide-react'

export default async function ReportesPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  const { rol, companyId } = session.user
  if (!['GERENTE', 'GERENTE_ZONAL', 'DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'SUPER_ADMIN'].includes(rol)) redirect('/dashboard')

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1)

  const [
    totalCartera,
    cashMesAgg,
    moraCount,
    liquidadosMes,
  ] = await Promise.all([
    prisma.loan.aggregate({
      where: { companyId: companyId!, estado: 'ACTIVE' },
      _sum: { totalPago: true },
    }),

    // Usar CashRegister (fecha @db.Date, sin problemas de timezone).
    // Suma los tres métodos de pago capturados en el mes actual.
    prisma.cashRegister.aggregate({
      where: {
        branch: { companyId: companyId! },
        fecha: { gte: startOfMonth, lt: endOfMonth },
      },
      _sum: {
        cobradoEfectivo:      true,
        cobradoTarjeta:       true,
        cobradoTransferencia: true,
      },
    }),

    prisma.paymentSchedule.count({
      where: {
        loan: { companyId: companyId!, estado: 'ACTIVE' },
        estado: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
        fechaVencimiento: { lt: today },
      },
    }),

    prisma.loan.count({
      where: {
        companyId: companyId!,
        estado: 'LIQUIDATED',
        updatedAt: { gte: startOfMonth },
      },
    }),
  ])

  const cobradoMes =
    Number(cashMesAgg._sum.cobradoEfectivo      ?? 0) +
    Number(cashMesAgg._sum.cobradoTarjeta       ?? 0) +
    Number(cashMesAgg._sum.cobradoTransferencia ?? 0)

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
        <p className="text-muted-foreground">Indicadores del mes en curso</p>
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
