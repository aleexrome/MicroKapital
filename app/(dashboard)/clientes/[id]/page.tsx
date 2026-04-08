import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { ScoreBadge } from '@/components/clients/ScoreBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoanDocumentUpload } from '@/components/loans/LoanDocumentUpload'
import { formatDate, formatMoney } from '@/lib/utils'
import { ArrowLeft, Phone, MapPin, User, CreditCard, History, Banknote, Building2, FolderOpen, Users } from 'lucide-react'
import Link from 'next/link'
import type { LoanType } from '@prisma/client'

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
          documents: {
            orderBy: { createdAt: 'desc' },
            select: { id: true, tipo: true },
          },
        },
      },
      payments: {
        orderBy: { fechaHora: 'desc' },
        take: 20,
        select: {
          id: true,
          monto: true,
          metodoPago: true,
          fechaHora: true,
          loan: { select: { tipo: true } },
          schedule: { select: { numeroPago: true } },
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
                const tieneAval = (loan.tipo === 'INDIVIDUAL' || loan.tipo === 'FIDUCIARIO') && loan.avalNombre
                return (
                  <div key={loan.id} className="border rounded-lg overflow-hidden">
                    <Link
                      href={`/prestamos/${loan.id}`}
                      className="block p-4 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{loan.tipo} · {formatMoney(Number(loan.capital))}</p>
                          <p className="text-sm text-muted-foreground">
                            Plazo: {loan.plazo} {loan.tipo === 'AGIL' ? 'días' : loan.tipo === 'FIDUCIARIO' ? 'quincenas' : 'semanas'} ·
                            {loan.pagoSemanal ? ` ${formatMoney(Number(loan.pagoSemanal))}/sem` : loan.pagoDiario ? ` ${formatMoney(Number(loan.pagoDiario))}/día` : ` ${formatMoney(Number(loan.pagoQuincenal))}/qna`}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {loan.documents.length} doc{loan.documents.length !== 1 ? 's' : ''} · {formatDate(loan.createdAt)}
                          </p>
                        </div>
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </div>
                    </Link>
                    {tieneAval && (
                      <div className="px-4 pb-3 border-t bg-muted/10">
                        <div className="flex items-center gap-2 mt-2">
                          <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{loan.avalNombre}</span>
                            {loan.avalRelacion ? ` · ${loan.avalRelacion}` : ''}
                            {loan.avalTelefono ? ` · ${loan.avalTelefono}` : ''}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Expediente digital — documentos por crédito */}
      {client.loans.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <FolderOpen className="h-4 w-4" />
            Expediente digital
          </h2>
          {client.loans.map((loan) => (
            <div key={loan.id} className="space-y-1">
              <p className="text-xs text-muted-foreground px-1">
                {loan.tipo} · {formatMoney(Number(loan.capital))} · {formatDate(loan.createdAt)}
              </p>
              <LoanDocumentUpload
                loanId={loan.id}
                tipo={loan.tipo as LoanType}
                readOnly={rol === 'DIRECTOR_COMERCIAL'}
              />
            </div>
          ))}
        </div>
      )}

      {/* Historial de pagos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" />
            Historial de pagos ({client.payments.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {client.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin pagos registrados</p>
          ) : (
            <div className="space-y-2">
              {client.payments.map((pago) => {
                const metodoIcon =
                  pago.metodoPago === 'CASH' ? <Banknote className="h-3.5 w-3.5 text-muted-foreground" /> :
                  pago.metodoPago === 'TRANSFER' ? <Building2 className="h-3.5 w-3.5 text-muted-foreground" /> :
                  <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                const metodoLabel =
                  pago.metodoPago === 'CASH' ? 'Efectivo' :
                  pago.metodoPago === 'TRANSFER' ? 'Transferencia' : 'Tarjeta'

                return (
                  <div key={pago.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                    <div className="flex items-center gap-3">
                      {metodoIcon}
                      <div>
                        <p className="font-medium text-gray-900">{formatMoney(Number(pago.monto))}</p>
                        <p className="text-xs text-muted-foreground">
                          {pago.loan.tipo}
                          {pago.schedule ? ` · Pago #${pago.schedule.numeroPago}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">{formatDate(pago.fechaHora)}</p>
                      <p className="text-xs text-muted-foreground">{metodoLabel}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
