import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AdminUsersTable } from '@/components/admin/AdminUsersTable'
import { AdminPaymentMethodSelect } from '@/components/admin/AdminPaymentRow'
import { formatMoney, formatDate } from '@/lib/utils'
import { Shield } from 'lucide-react'

export default async function AdminPage({
  searchParams,
}: {
  searchParams: { tab?: string; loanId?: string }
}) {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  if (session.user.rol !== 'SUPER_ADMIN') redirect('/dashboard')

  const { companyId, id: currentUserId } = session.user

  const tab = searchParams.tab ?? 'usuarios'

  // ── Users ─────────────────────────────────────────────────────────────────────
  const users = tab === 'usuarios'
    ? await prisma.user.findMany({
        where: { companyId: companyId! },
        select: {
          id: true,
          nombre: true,
          email: true,
          rol: true,
          activo: true,
          createdAt: true,
          permisoAplicarPagos: true,
          branch: { select: { nombre: true } },
        },
        orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
      })
    : []

  // ── Payments ──────────────────────────────────────────────────────────────────
  const payments = tab === 'pagos'
    ? await prisma.payment.findMany({
        where: { loan: { companyId: companyId! } },
        orderBy: { fechaHora: 'desc' },
        take: 100,
        select: {
          id: true,
          monto: true,
          metodoPago: true,
          fechaHora: true,
          client: { select: { nombreCompleto: true } },
          cobrador: { select: { nombre: true } },
          loan: { select: { tipo: true } },
        },
      })
    : []

  const TABS = [
    { value: 'usuarios', label: 'Usuarios' },
    { value: 'pagos',    label: 'Pagos retroactivos' },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="bg-gray-900 text-white rounded-lg p-2">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Panel de Administración</h1>
          <p className="text-muted-foreground text-sm">Gestión de cuentas y pagos — Solo Super Admin</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <a
            key={t.value}
            href={`/admin?tab=${t.value}`}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.value
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-muted-foreground hover:text-gray-700'
            }`}
          >
            {t.label}
          </a>
        ))}
      </div>

      {/* Usuarios tab */}
      {tab === 'usuarios' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Usuarios registrados ({users.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <AdminUsersTable
              users={users.map((u) => ({
                ...u,
                createdAt: u.createdAt.toISOString(),
              }))}
              currentUserId={currentUserId}
            />
          </CardContent>
        </Card>
      )}

      {/* Pagos retroactivos tab */}
      {tab === 'pagos' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Pagos recientes — Ajuste retroactivo de método de pago
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Fecha</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Cliente</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Producto</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Monto</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Cobrador</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Método</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {formatDate(p.fechaHora)}
                      </td>
                      <td className="px-4 py-3 font-medium">{p.client.nombreCompleto}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.loan.tipo}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatMoney(Number(p.monto))}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.cobrador.nombre}</td>
                      <td className="px-4 py-3">
                        <AdminPaymentMethodSelect
                          paymentId={p.id}
                          currentMethod={p.metodoPago}
                        />
                      </td>
                    </tr>
                  ))}
                  {payments.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-muted-foreground">
                        No hay pagos registrados
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
