import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatMoney, formatDate, formatDateTime } from '@/lib/utils'

export default async function MisPagosPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  const { id: userId, companyId } = session.user

  const client = await prisma.client.findFirst({
    where: { userId, companyId: companyId! },
  })

  if (!client) {
    return <div className="text-center py-12 text-muted-foreground">No se encontró tu expediente</div>
  }

  const pagos = await prisma.payment.findMany({
    where: { clientId: client.id },
    orderBy: { fechaHora: 'desc' },
    include: {
      loan: { select: { tipo: true } },
      schedule: { select: { numeroPago: true } },
      ticket: { select: { numeroTicket: true, qrCode: true } },
    },
  })

  return (
    <div className="space-y-6 py-6">
      <div>
        <h1 className="text-xl font-bold">Historial de pagos</h1>
        <p className="text-sm text-muted-foreground">{pagos.length} pagos registrados</p>
      </div>

      {pagos.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8 text-muted-foreground">
            No tienes pagos registrados aún
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {pagos.map((pago) => (
            <Card key={pago.id}>
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold money">{formatMoney(Number(pago.monto))}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {pago.loan.tipo}
                      {pago.schedule && ` · Pago ${pago.schedule.numeroPago}`} ·{' '}
                      {pago.metodoPago === 'CASH' ? '💵 Efectivo' : '💳 Tarjeta'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{formatDateTime(pago.fechaHora)}</p>
                  </div>
                  {pago.ticket && (
                    <div className="text-right">
                      <p className="text-xs font-mono text-muted-foreground">{pago.ticket.numeroTicket}</p>
                      <Badge variant="success" className="text-xs mt-1">Pagado</Badge>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
