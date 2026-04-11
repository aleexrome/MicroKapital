import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ApprovalBadge } from '@/components/loans/ApprovalBadge'
import { formatMoney, formatDate } from '@/lib/utils'
import { Plus, CreditCard } from 'lucide-react'
import type { LoanStatus } from '@prisma/client'

export default async function PrestamosPage() {
  const session = await getSession()
  if (!session?.user) return null

  const { rol, companyId, branchId } = session.user

  let cobradorIdFilter: string | undefined
  if (rol === 'COBRADOR') {
    const cobrador = await prisma.user.findFirst({
      where: { companyId: companyId!, email: session.user.email! },
    })
    cobradorIdFilter = cobrador?.id
  }

  const loans = await prisma.loan.findMany({
    where: {
      companyId: companyId!,
      ...(cobradorIdFilter ? { cobradorId: cobradorIdFilter } : {}),
      ...(rol === 'COBRADOR' && branchId ? { branchId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      client: { select: { nombreCompleto: true } },
      cobrador: { select: { nombre: true } },
    },
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cartera de préstamos</h1>
          <p className="text-muted-foreground">{loans.length} registros</p>
        </div>
        <Button asChild>
          <Link href="/prestamos/nuevo">
            <Plus className="h-4 w-4" />
            Nuevo préstamo
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loans.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CreditCard className="h-10 w-10 mx-auto mb-3" />
              No hay préstamos registrados
            </div>
          ) : (
            <div className="divide-y">
              {loans.map((loan) => (
                <Link
                  key={loan.id}
                  href={`/prestamos/${loan.id}`}
                  className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <p className="font-medium">{loan.client.nombreCompleto}</p>
                    <p className="text-sm text-muted-foreground">
                      {loan.tipo} · {loan.cobrador.nombre} · {formatDate(loan.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold money">{formatMoney(Number(loan.capital))}</span>
                    <ApprovalBadge status={loan.estado as LoanStatus} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
