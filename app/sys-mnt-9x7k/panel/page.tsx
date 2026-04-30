export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { formatMoney, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { Building2, CreditCard, Users, AlertTriangle } from 'lucide-react'
import { todayMx } from '@/lib/timezone'

const LICENSE_STATUS_BADGE: Record<string, { label: string; variant: 'success' | 'warning' | 'error' | 'secondary' }> = {
  ACTIVE:    { label: 'Activa',     variant: 'success' },
  GRACE:     { label: 'Gracia',     variant: 'warning' },
  SUSPENDED: { label: 'Suspendida', variant: 'error' },
  CANCELLED: { label: 'Cancelada',  variant: 'secondary' },
}

export default async function SuperAdminPanelPage() {
  const [companies, totalLoans, totalPaymentsToday] = await Promise.all([
    prisma.company.findMany({
      where: { nombre: { not: '__SYSTEM__' } },
      include: {
        license: true,
        _count: {
          select: {
            users: { where: { rol: { not: 'SUPER_ADMIN' } } },
            clients: true,
            loans: { where: { estado: 'ACTIVE' } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),

    prisma.loan.count({ where: { estado: 'ACTIVE' } }),

    prisma.payment.count({
      where: {
        fechaHora: {
          gte: todayMx(),
        },
      },
    }),
  ])

  const activeCompanies = companies.filter((c) => c.license?.estado === 'ACTIVE').length
  const suspendedCompanies = companies.filter((c) => c.license?.estado === 'SUSPENDED').length

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Panel de control</h1>
        <p className="text-gray-400 text-sm">Vista global de todas las empresas cliente</p>
      </div>

      {/* Métricas globales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Empresas activas', value: activeCompanies, icon: Building2, color: 'text-green-400' },
          { label: 'Suspendidas', value: suspendedCompanies, icon: AlertTriangle, color: 'text-yellow-400' },
          { label: 'Préstamos activos', value: totalLoans, icon: CreditCard, color: 'text-blue-400' },
          { label: 'Pagos hoy', value: totalPaymentsToday, icon: Users, color: 'text-purple-400' },
        ].map((m) => (
          <div key={m.label} className="bg-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">{m.label}</p>
              <m.icon className={`h-4 w-4 ${m.color}`} />
            </div>
            <p className={`text-2xl font-bold mt-1 ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Lista de empresas */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Empresas cliente</h2>
          <Link
            href="/sys-mnt-9x7k/empresas"
            className="text-sm text-yellow-400 hover:text-yellow-300"
          >
            Ver todas →
          </Link>
        </div>

        <div className="space-y-3">
          {companies.map((company) => {
            const licenseStatus = company.license?.estado ?? 'CANCELLED'
            const st = LICENSE_STATUS_BADGE[licenseStatus]

            return (
              <div
                key={company.id}
                className="bg-gray-800 rounded-lg p-4 flex items-center justify-between"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-white truncate">{company.nombre}</p>
                    <Badge variant={st.variant} className="text-xs">{st.label}</Badge>
                  </div>
                  <div className="flex gap-4 mt-1 text-xs text-gray-400">
                    <span>{company._count.users} usuarios</span>
                    <span>{company._count.clients} clientes</span>
                    <span>{company._count.loans} préstamos activos</span>
                  </div>
                  {company.license && (
                    <p className="text-xs text-gray-500 mt-1">
                      Licencia: {company.license.claveLicencia} ·{' '}
                      {formatMoney(Number(company.license.precioMensual))}/mes ·{' '}
                      Próximo pago: {formatDate(company.license.proximoPago)}
                    </p>
                  )}
                </div>

                <Link
                  href={`/sys-mnt-9x7k/licencias?companyId=${company.id}`}
                  className="ml-4 text-xs text-yellow-400 hover:text-yellow-300 flex-shrink-0"
                >
                  Gestionar →
                </Link>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
