import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { ScoreBadge } from '@/components/clients/ScoreBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate, formatMoney } from '@/lib/utils'
import { ArrowLeft, Phone, MapPin, User, CreditCard } from 'lucide-react'
import Link from 'next/link'

export default async function ClienteExpedientePage({
  params,
}: {
  params: { id: string }
}) {
  const session = await getSession()
  if (!session?.user) return null

  const { companyId, rol, branchId } = session.user

  const where: { id: string; companyId: string; branchId?: string } = {
    id: params.id,
    companyId: companyId!,
  }

  // COBRADOR solo accede a clientes de su sucursal
  if (rol === 'COBRADOR' && branchId) {
    where.branchId = branchId
  }

  const client = await prisma.client.findFirst({
    where,
    include: {
      cobrador: { select: { nombre: true } },
      branch: { select: { nombre: true } },
      loans: {
        orderBy: { createdAt: 'desc' },
        include: {
          cobrador: { select: { nombre: true } },
          schedule: { orderBy: { numeroPago: 'asc' }, take: 3 },
        },
      },
      scoreEvents: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  })

  if (!client) notFound()

  const statusLabel: Record<string, { label: string; variant: 'success' | 'warning' | 'error' | 'info' | 'outline' }> = {
    PENDING_APPROVAL: { label: 'Pendiente', variant: 'warning' },
    ACTIVE: { label: 'Activo', variant: 'success' },
    LIQUIDATED: { label: 'Liquidado', variant: 'info' },
    REJECTED: { label: 'Rechazado', variant: 'error' },
    DEFAULTED: { label: 'Incumplido', variant: 'error' },
    RESTRUCTURED: { label: 'Reestructurado', variant: 'outline' },
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/clientes"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{client.nombreCompleto}</h1>
          <p className="text-muted-foreground">Expediente del cliente</p>
        </div>
      </div>

      {/* Score + info básica */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4" />Datos personales</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {client.telefono && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{client.telefono}</span>
                {client.telefonoAlt && <span className="text-muted-foreground">/ {client.telefonoAlt}</span>}
              </div>
            )}
            {client.domicilio && (
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <span>{client.domicilio}</span>
              </div>
            )}
            {client.cobrador && (
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>Cobrador: {client.cobrador.nombre}</span>
              </div>
            )}
            <div className="pt-2">
              <ScoreBadge score={client.score} size="md" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Historial de score</CardTitle></CardHeader>
          <CardContent>
            {client.scoreEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin eventos de score aún</p>
            ) : (
              <div className="space-y-1.5">
                {client.scoreEvents.map((ev) => (
                  <div key={ev.id} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{formatDate(ev.createdAt)}</span>
                    <span className={ev.cambioScore >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                      {ev.cambioScore >= 0 ? '+' : ''}{ev.cambioScore}
                    </span>
                    <span className="font-semibold">{ev.scoreResultado}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Préstamos */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Préstamos ({client.loans.length})
          </CardTitle>
          <Button asChild size="sm">
            <Link href={`/prestamos/nuevo?clienteId=${client.id}`}>Nuevo préstamo</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {client.loans.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin préstamos registrados</p>
          ) : (
            <div className="space-y-3">
              {client.loans.map((loan) => {
                const st = statusLabel[loan.estado] ?? { label: loan.estado, variant: 'outline' as const }
                return (
                  <Link
                    key={loan.id}
                    href={`/prestamos/${loan.id}`}
                    className="block border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{loan.tipo} · {formatMoney(Number(loan.capital))}</p>
                        <p className="text-sm text-muted-foreground">
                          Plazo: {loan.plazo} {loan.tipo === 'AGIL' ? 'días' : 'semanas'} ·
                          {loan.pagoSemanal ? ` $${Number(loan.pagoSemanal).toFixed(2)}/sem` : ` $${Number(loan.pagoDiario).toFixed(2)}/día`}
                        </p>
                      </div>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
