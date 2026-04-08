import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { ApprovalBadge } from '@/components/loans/ApprovalBadge'
import { LoanApprovalActions } from '@/components/loans/LoanApprovalActions'
import { DocumentChecklist } from '@/components/loans/DocumentChecklist'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatMoney, formatDate } from '@/lib/utils'
import { ArrowLeft, CreditCard } from 'lucide-react'
import Link from 'next/link'
import type { LoanStatus, LoanType, ScheduleStatus } from '@prisma/client'

const SCHEDULE_STATUS_VARIANT: Record<ScheduleStatus, 'success' | 'warning' | 'error' | 'secondary' | 'info' | 'outline'> = {
  PENDING: 'warning',
  PAID: 'success',
  OVERDUE: 'error',
  PARTIAL: 'info',
  ADVANCE: 'success',
}

export default async function PrestamoDetallePage({ params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session?.user) return null

  const { companyId, rol } = session.user

  const loan = await prisma.loan.findFirst({
    where: { id: params.id, companyId: companyId! },
    include: {
      client: { select: { id: true, nombreCompleto: true } },
      cobrador: { select: { nombre: true } },
      aprobadoPor: { select: { nombre: true } },
      schedule: { orderBy: { numeroPago: 'asc' } },
      payments: {
        orderBy: { fechaHora: 'desc' },
        take: 10,
        include: { tickets: { where: { esReimpresion: false }, take: 1, select: { numeroTicket: true } } },
      },
    },
  })
  type ChecklistItem = { id: string; label: string; checked: boolean }

  if (!loan) notFound()

  const pagados = loan.schedule.filter((s) => s.estado === 'PAID').length

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/prestamos"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">Préstamo {loan.tipo}</h1>
            <ApprovalBadge status={loan.estado as LoanStatus} />
          </div>
          {loan.estado === 'PENDING_APPROVAL' && (rol === 'GERENTE' || rol === 'DIRECTOR_GENERAL' || rol === 'SUPER_ADMIN') && (
            <LoanApprovalActions loanId={loan.id} />
          )}
          <p className="text-muted-foreground">
            <Link href={`/clientes/${loan.client.id}`} className="hover:underline">
              {loan.client.nombreCompleto}
            </Link>
          </p>
        </div>
      </div>

      {/* Resumen financiero */}
      <Card>
        <CardHeader><CardTitle className="text-base">Resumen financiero</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div><p className="text-muted-foreground">Capital</p><p className="font-bold money">{formatMoney(Number(loan.capital))}</p></div>
          {Number(loan.comision) > 0 && <div><p className="text-muted-foreground">Comisión (17%)</p><p className="font-bold text-orange-600 money">-{formatMoney(Number(loan.comision))}</p></div>}
          <div><p className="text-muted-foreground">Monto entregado</p><p className="font-bold money">{formatMoney(Number(loan.montoReal))}</p></div>
          <div><p className="text-muted-foreground">Interés</p><p className="font-bold money">{formatMoney(Number(loan.interes))}</p></div>
          <div><p className="text-muted-foreground">Total a pagar</p><p className="font-bold text-primary-700 money">{formatMoney(Number(loan.totalPago))}</p></div>
          <div>
            <p className="text-muted-foreground">
              {loan.tipo === 'AGIL' ? 'Pago diario' : loan.tipo === 'FIDUCIARIO' ? 'Pago quincenal' : 'Pago semanal'}
            </p>
            <p className="font-bold money">
              {loan.tipo === 'AGIL'
                ? formatMoney(Number(loan.pagoDiario))
                : loan.tipo === 'FIDUCIARIO'
                ? formatMoney(Number(loan.pagoQuincenal))
                : formatMoney(Number(loan.pagoSemanal))}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Plazo</p>
            <p className="font-semibold">{loan.plazo} {loan.tipo === 'AGIL' ? 'días hábiles' : loan.tipo === 'FIDUCIARIO' ? 'quincenas' : 'semanas'}</p>
          </div>
          <div><p className="text-muted-foreground">Cobrador</p><p className="font-semibold">{loan.cobrador.nombre}</p></div>
          {loan.fechaDesembolso && <div><p className="text-muted-foreground">Desembolso</p><p className="font-semibold">{formatDate(loan.fechaDesembolso)}</p></div>}
          {loan.aprobadoPor && <div><p className="text-muted-foreground">Aprobado por</p><p className="font-semibold">{loan.aprobadoPor.nombre}</p></div>}
        </CardContent>
      </Card>

      {/* Checklist de documentos */}
      <DocumentChecklist
        loanId={loan.id}
        tipo={loan.tipo as LoanType}
        savedChecklist={(loan.documentChecklist as ChecklistItem[] | null) ?? null}
      />

      {/* Progreso de pagos */}
      {loan.schedule.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Calendario de pagos</span>
              <span className="text-sm font-normal text-muted-foreground">{pagados}/{loan.schedule.length} pagados</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {loan.schedule.map((s) => {
                const capturable = loan.estado === 'ACTIVE' &&
                  (s.estado === 'PENDING' || s.estado === 'OVERDUE' || s.estado === 'PARTIAL') &&
                  (rol === 'COBRADOR' || rol === 'COORDINADOR')
                return (
                  <div key={s.id} className="flex items-center gap-2 py-2 text-sm">
                    <span className="text-muted-foreground w-7 shrink-0">{s.numeroPago}.</span>
                    <span className="w-24 shrink-0">{formatDate(s.fechaVencimiento)}</span>
                    <span className="money font-medium w-20 shrink-0">{formatMoney(Number(s.montoEsperado))}</span>
                    <Badge variant={SCHEDULE_STATUS_VARIANT[s.estado as ScheduleStatus]} className="text-xs">
                      {s.estado === 'PAID' ? 'Pagado' : s.estado === 'OVERDUE' ? 'Vencido' : s.estado === 'PARTIAL' ? 'Parcial' : 'Pendiente'}
                    </Badge>
                    {capturable && (
                      <Button asChild size="sm" variant="outline" className="ml-auto h-7 text-xs px-2">
                        <Link href={`/cobros/capturar/${s.id}`}>
                          <CreditCard className="h-3 w-3 mr-1" />Capturar
                        </Link>
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
