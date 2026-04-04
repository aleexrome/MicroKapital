import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { formatMoney, formatDate } from '@/lib/utils'
import {
  Users,
  CreditCard,
  TrendingUp,
  AlertTriangle,
  DollarSign,
  Calendar,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default async function DashboardPage() {
  const session = await auth()

  if (!session?.user || session.user.rol === 'COBRADOR') {
    redirect('/cobros/agenda')
  }

  const { companyId } = session.user
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  // Métricas generales
  const [
    totalClientes,
    prestamosActivos,
    cobroHoy,
    carteraVencida,
    recientes,
  ] = await Promise.all([
    prisma.client.count({ where: { companyId: companyId!, activo: true } }),

    prisma.loan.count({
      where: { companyId: companyId!, estado: 'ACTIVE' },
    }),

    prisma.payment.aggregate({
      where: {
        loan: { companyId: companyId! },
        fechaHora: { gte: today, lt: tomorrow },
      },
      _sum: { monto: true },
    }),

    prisma.paymentSchedule.count({
      where: {
        loan: { companyId: companyId! },
        estado: 'OVERDUE',
      },
    }),

    prisma.loan.findMany({
      where: { companyId: companyId! },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        client: { select: { nombreCompleto: true } },
        cobrador: { select: { nombre: true } },
      },
    }),
  ])

  const cobradoHoy = Number(cobroHoy._sum.monto ?? 0)

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-muted-foreground">{formatDate(new Date(), "EEEE d 'de' MMMM, yyyy")}</p>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Clientes activos"
          value={totalClientes.toLocaleString('es-MX')}
          icon={Users}
          color="blue"
        />
        <MetricCard
          title="Préstamos activos"
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

      {/* Préstamos recientes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Préstamos recientes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recientes.map((loan) => (
              <div
                key={loan.id}
                className="flex items-center justify-between py-2 border-b last:border-0"
              >
                <div>
                  <p className="text-sm font-medium">{loan.client.nombreCompleto}</p>
                  <p className="text-xs text-muted-foreground">
                    Cobrador: {loan.cobrador.nombre} · {formatDate(loan.createdAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold money">{formatMoney(Number(loan.capital))}</p>
                  <Badge
                    variant={
                      loan.estado === 'ACTIVE'
                        ? 'success'
                        : loan.estado === 'PENDING_APPROVAL'
                        ? 'warning'
                        : loan.estado === 'LIQUIDATED'
                        ? 'info'
                        : 'error'
                    }
                    className="text-xs"
                  >
                    {loan.estado === 'ACTIVE'
                      ? 'Activo'
                      : loan.estado === 'PENDING_APPROVAL'
                      ? 'Pendiente'
                      : loan.estado === 'LIQUIDATED'
                      ? 'Liquidado'
                      : loan.estado}
                  </Badge>
                </div>
              </div>
            ))}
            {recientes.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No hay préstamos registrados aún
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
