import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { type Prisma } from '@prisma/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatMoney, formatDateTime } from '@/lib/utils'
import { History } from 'lucide-react'

export default async function HistorialCobrosPage() {
  const session = await getSession()
  if (!session?.user) return null

  const { companyId, rol, branchId, id: userId } = session.user

  // Scope by role — coordinadores ven solo los suyos, gerentes su sucursal
  const paymentWhere: Prisma.PaymentWhereInput = { loan: { companyId: companyId! } }
  if (rol === 'COORDINADOR' || rol === 'COBRADOR') {
    paymentWhere.cobradorId = userId
  } else if (rol === 'GERENTE') {
    const branchIds = session.user.zonaBranchIds?.length
      ? session.user.zonaBranchIds
      : branchId ? [branchId] : null
    if (branchIds?.length) paymentWhere.loan = { companyId: companyId!, branchId: { in: branchIds } }
  } else if (rol === 'GERENTE_ZONAL') {
    const zoneIds = session.user.zonaBranchIds
    if (zoneIds?.length) paymentWhere.loan = { companyId: companyId!, branchId: { in: zoneIds } }
  }

  const payments = await prisma.payment.findMany({
    where: paymentWhere,
    orderBy: { fechaHora: 'desc' },
    take: 50,
    select: {
      id: true,
      monto: true,
      metodoPago: true,
      fechaHora: true,
      client: { select: { nombreCompleto: true } },
      loan: { select: { tipo: true } },
      tickets: { where: { esReimpresion: false }, take: 1, select: { numeroTicket: true } },
      schedule: { select: { numeroPago: true } },
    },
  })

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Historial</h1>
        <p className="text-muted-foreground">{payments.length} pagos registrados</p>
      </div>

      {payments.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <History className="h-10 w-10 mx-auto mb-3" />
          Sin cobros registrados
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-6 py-4">
                  <div>
                    <p className="font-medium">{p.client.nombreCompleto}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.loan.tipo}
                      {p.schedule && ` · Pago ${p.schedule.numeroPago}`} ·{' '}
                      {p.metodoPago === 'CASH' ? '💵' : '💳'} ·{' '}
                      {formatDateTime(p.fechaHora)}
                    </p>
                    {p.tickets[0] && (
                      <p className="text-xs font-mono text-muted-foreground">{p.tickets[0].numeroTicket}</p>
                    )}
                  </div>
                  <span className="font-bold money">{formatMoney(Number(p.monto))}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
