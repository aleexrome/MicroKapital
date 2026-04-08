import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatMoney, formatDate } from '@/lib/utils'
import { CheckCircle, FileText } from 'lucide-react'
import Link from 'next/link'

export default async function CreditosConcluidos() {
  const session = await getSession()
  if (!session?.user) return null

  const { rol, companyId } = session.user

  const isCoordinator = rol === 'COBRADOR' || rol === 'COORDINADOR'

  let cobradorId: string | undefined
  if (isCoordinator) {
    const user = await prisma.user.findFirst({
      where: { companyId: companyId!, email: session.user.email! },
    })
    cobradorId = user?.id
  }

  const loans = await prisma.loan.findMany({
    where: {
      companyId: companyId!,
      estado: 'LIQUIDATED',
      ...(cobradorId ? { cobradorId } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      client: { select: { id: true, nombreCompleto: true } },
      cobrador: { select: { nombre: true } },
      branch: { select: { nombre: true } },
      payments: {
        orderBy: { fechaHora: 'desc' },
        take: 1,
        select: { fechaHora: true },
      },
    },
  })

  const tipoLabel: Record<string, string> = {
    SOLIDARIO: 'Solidario',
    INDIVIDUAL: 'Individual',
    AGIL: 'Ágil',
    FIDUCIARIO: 'Fiduciario',
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Historial de créditos concluidos</h1>
        <p className="text-muted-foreground">{loans.length} crédito(s) liquidado(s)</p>
      </div>

      {loans.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-3" />
            <p className="text-muted-foreground">No hay créditos concluidos aún</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {loans.map((loan) => {
            const liquidadoAt = loan.payments[0]?.fechaHora ?? loan.updatedAt
            return (
              <Card key={loan.id}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant="success" className="text-xs">Liquidado</Badge>
                        <Badge variant="secondary" className="text-xs">{tipoLabel[loan.tipo] ?? loan.tipo}</Badge>
                        <span className="text-xs text-muted-foreground">{loan.branch.nombre}</span>
                      </div>
                      <p className="font-semibold text-gray-900">{loan.client.nombreCompleto}</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-0.5 mt-1.5 text-sm">
                        <div><span className="text-muted-foreground">Capital: </span><span className="font-medium money">{formatMoney(Number(loan.capital))}</span></div>
                        <div><span className="text-muted-foreground">Total: </span><span className="font-medium money">{formatMoney(Number(loan.totalPago))}</span></div>
                        <div><span className="text-muted-foreground">Cobrador: </span><span>{loan.cobrador.nombre}</span></div>
                        <div><span className="text-muted-foreground">Liquidado: </span><span>{formatDate(liquidadoAt)}</span></div>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/prestamos/${loan.id}`}>
                          <FileText className="h-3 w-3" /> Ver detalle
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/creditos-concluidos/${loan.id}/pdf`}>
                          <FileText className="h-3 w-3" /> PDF
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
