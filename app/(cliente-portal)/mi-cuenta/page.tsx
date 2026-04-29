import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { ScoreBadge } from '@/components/clients/ScoreBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatMoney, formatDate } from '@/lib/utils'
import { CreditCard, Calendar } from 'lucide-react'

export default async function MiCuentaPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  const { id: userId, companyId } = session.user

  const clienteUser = await prisma.client.findFirst({
    where: { userId, companyId: companyId! },
    include: {
      loans: {
        where: { estado: 'ACTIVE' },
        include: {
          // Schedules pendientes para próximo pago + saldo total pendiente
          schedule: {
            where: { estado: { not: 'PAID' } },
            orderBy: { numeroPago: 'asc' },
          },
        },
      },
    },
  })

  if (!clienteUser) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No se encontró tu expediente</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 py-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Hola, {clienteUser.nombreCompleto.split(' ')[0]}</h1>
        <p className="text-muted-foreground text-sm">Tu estado de cuenta</p>
      </div>

      {/* Score */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Tu calificación</p>
            <ScoreBadge score={clienteUser.score} size="lg" />
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Escala</p>
            <p className="text-xs">0 — 1000</p>
          </div>
        </CardContent>
      </Card>

      {/* Préstamos activos */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Préstamos activos</h2>
        {clienteUser.loans.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8 text-muted-foreground">
              No tienes préstamos activos
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {clienteUser.loans.map((loan) => {
              const proxPago = loan.schedule.find((s) => s.estado === 'PENDING' || s.estado === 'OVERDUE')
              // Saldo pendiente: suma de schedules no pagados (no expone "interés")
              const saldoPendiente = loan.schedule.reduce(
                (sum, s) => sum + Number(s.montoEsperado) - Number(s.montoPagado),
                0,
              )
              return (
                <Card key={loan.id}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-primary-600" />
                        <span className="font-medium">{loan.tipo}</span>
                      </div>
                      <Badge variant="success">Activo</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Capital</p>
                        <p className="font-semibold money">{formatMoney(Number(loan.capital))}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Saldo pendiente</p>
                        <p className="font-semibold money">{formatMoney(saldoPendiente)}</p>
                      </div>
                    </div>
                    {proxPago && (
                      <div className="mt-3 p-3 bg-yellow-50 rounded-lg flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-yellow-600 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-medium text-yellow-800">Próximo pago</p>
                          <p className="text-sm font-bold text-yellow-900 money">
                            {formatMoney(Number(proxPago.montoEsperado))} — {formatDate(proxPago.fechaVencimiento)}
                          </p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
