export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatMoney, formatDate } from '@/lib/utils'
import { AlertTriangle, ClipboardList, CheckCircle } from 'lucide-react'
import { loanNotDeletedWhere } from '@/lib/access'

const ROLES_PERMITIDOS = ['MESA_CONTROL', 'DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'SUPER_ADMIN']

export default async function MesaControlPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  if (!ROLES_PERMITIDOS.includes(session.user.rol)) redirect('/prestamos')

  const { companyId } = session.user

  const [pendientes, regresadas] = await Promise.all([
    prisma.loan.findMany({
      where: {
        companyId: companyId!,
        estado: 'PENDING_REVIEW',
        ...loanNotDeletedWhere,
      },
      orderBy: { createdAt: 'asc' },
      include: {
        client: { select: { id: true, nombreCompleto: true } },
        cobrador: { select: { nombre: true } },
        branch: { select: { nombre: true } },
      },
    }),
    prisma.loan.findMany({
      where: {
        companyId: companyId!,
        estado: 'RETURNED_TO_COORDINATOR',
        ...loanNotDeletedWhere,
      },
      orderBy: { revisadoAt: 'desc' },
      include: {
        client: { select: { id: true, nombreCompleto: true } },
        cobrador: { select: { nombre: true } },
        branch: { select: { nombre: true } },
      },
    }),
  ])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-primary-700" />
          Mesa de Control
        </h1>
        <p className="text-muted-foreground">
          Revisa expedientes de solicitudes antes de enviarlas a aprobación de Dirección General.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
          Por revisar ({pendientes.length})
        </h2>
        {pendientes.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
              No hay solicitudes pendientes de revisión.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {pendientes.map((loan) => (
              <Link key={loan.id} href={`/prestamos/${loan.id}`}>
                <Card className="hover:bg-gray-50 transition-colors cursor-pointer">
                  <CardContent className="p-5">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold">{loan.client.nombreCompleto}</span>
                          <Badge variant="warning">{loan.tipo}</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm mt-2">
                          <div>
                            <span className="text-muted-foreground">Capital:</span>{' '}
                            <span className="font-medium money">{formatMoney(Number(loan.capital))}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Sucursal:</span>{' '}
                            {loan.branch?.nombre ?? '—'}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Cobradora:</span> {loan.cobrador.nombre}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Solicitado:</span> {formatDate(loan.createdAt)}
                          </div>
                        </div>
                        {loan.notas && (
                          <p className="text-sm text-muted-foreground italic mt-2">{loan.notas}</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-blue-500" />
          Regresadas al coordinador ({regresadas.length})
        </h2>
        {regresadas.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8 text-muted-foreground">
              Ninguna solicitud regresada por el momento.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {regresadas.map((loan) => (
              <Link key={loan.id} href={`/prestamos/${loan.id}`}>
                <Card className="hover:bg-gray-50 transition-colors cursor-pointer">
                  <CardContent className="p-5">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold">{loan.client.nombreCompleto}</span>
                          <Badge variant="default">Regresada</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm mt-2">
                          <div>
                            <span className="text-muted-foreground">Capital:</span>{' '}
                            <span className="font-medium money">{formatMoney(Number(loan.capital))}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Sucursal:</span>{' '}
                            {loan.branch?.nombre ?? '—'}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Cobradora:</span> {loan.cobrador.nombre}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Regresada:</span>{' '}
                            {loan.revisadoAt ? formatDate(loan.revisadoAt) : '—'}
                          </div>
                        </div>
                        {loan.revisionNotasGenerales && (
                          <p className="text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded p-2 mt-2 whitespace-pre-wrap">
                            {loan.revisionNotasGenerales}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
