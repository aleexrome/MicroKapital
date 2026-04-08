import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { ApprovalBadge } from '@/components/loans/ApprovalBadge'
import { LoanApprovalActions } from '@/components/loans/LoanApprovalActions'
import { LoanActivateButton } from '@/components/loans/LoanActivateButton'
import { LoanClientRejectButton } from '@/components/loans/LoanClientRejectButton'
import { LoanRenewButton } from '@/components/loans/LoanRenewButton'
import { DocumentChecklist } from '@/components/loans/DocumentChecklist'
import { ScheduleDateEditor } from '@/components/loans/ScheduleDateEditor'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatMoney, formatDate } from '@/lib/utils'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import type { LoanStatus, LoanType, ScheduleStatus } from '@prisma/client'

// Umbral de pagos para renovación anticipada por producto
const UMBRAL_RENOVACION: Record<string, number> = {
  SOLIDARIO:  6,
  INDIVIDUAL: 9,
  AGIL:       20,
}

// Pagos que financia la empresa al renovar
const PAGOS_FINANCIADOS: Record<string, number> = {
  SOLIDARIO:  2,
  INDIVIDUAL: 3,
  AGIL:       4,
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
      loanOriginal: { select: { id: true } },
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

  // Determinar si aplica renovación anticipada
  const umbral = UMBRAL_RENOVACION[loan.tipo]
  const pagosFinanciados = PAGOS_FINANCIADOS[loan.tipo]
  const puedeRenovar =
    loan.estado === 'ACTIVE' &&
    umbral !== undefined &&
    pagados >= umbral &&
    (rol === 'COORDINADOR' || rol === 'COBRADOR' || rol === 'GERENTE_ZONAL' || rol === 'GERENTE')

  // Roles que pueden activar un crédito APPROVED
  const puedeActivar =
    loan.estado === 'APPROVED' &&
    (rol === 'COORDINADOR' || rol === 'COBRADOR' || rol === 'GERENTE_ZONAL' || rol === 'GERENTE' || rol === 'SUPER_ADMIN')

  // Director General puede editar fechas del calendario
  const puedeEditarFechas = loan.estado === 'ACTIVE' && (rol === 'DIRECTOR_GENERAL' || rol === 'SUPER_ADMIN')

  // Coordinador/Cobrador pueden capturar pagos
  const puedeCapturar = loan.estado === 'ACTIVE' && (rol === 'COBRADOR' || rol === 'COORDINADOR')

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/prestamos"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">Préstamo {loan.tipo}</h1>
            <ApprovalBadge status={loan.estado as LoanStatus} />
          </div>

          {/* Director General: aprobar / contrapropuesta / rechazar */}
          {loan.estado === 'PENDING_APPROVAL' && (rol === 'DIRECTOR_GENERAL' || rol === 'SUPER_ADMIN') && (
            <LoanApprovalActions
              loanId={loan.id}
              tipo={loan.tipo}
              capital={Number(loan.capital)}
              tasaInteres={loan.tasaInteres ? Number(loan.tasaInteres) : undefined}
            />
          )}

          {/* Coordinador / Gerente Zonal: activar crédito ya aprobado o registrar rechazo del cliente */}
          {puedeActivar && (
            <div className="pt-1 space-y-2">
              <p className="text-sm text-blue-700 font-medium">
                Crédito aprobado por el Director General. Preséntalo al cliente y actívalo si acepta.
              </p>
              <div className="flex flex-wrap gap-2">
                <LoanActivateButton loanId={loan.id} />
                <LoanClientRejectButton loanId={loan.id} />
              </div>
            </div>
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
          {/* Banner de renovación con desglose del descuento */}
          {loan.loanOriginalId && loan.descuentoRenovacion && (
            <div className="col-span-2 sm:col-span-3 rounded-lg bg-green-50 border border-green-200 p-3 text-sm space-y-1">
              <p className="font-semibold text-green-800">Renovación anticipada</p>
              <div className="text-green-700 space-y-0.5">
                <p>Capital del nuevo crédito: <span className="font-medium money">{formatMoney(Number(loan.capital))}</span></p>
                <p>Descuento — pagos financiados por la empresa:
                  <span className="font-bold text-orange-600 money ml-1">-{formatMoney(Number(loan.descuentoRenovacion))}</span>
                </p>
                <p className="font-bold">Monto entregado al cliente:
                  <span className="money ml-1">{formatMoney(Number(loan.montoReal))}</span>
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Crédito anterior:{' '}
                <Link href={`/prestamos/${loan.loanOriginalId}`} className="underline">
                  ver historial
                </Link>
              </p>
            </div>
          )}
          <div><p className="text-muted-foreground">Capital</p><p className="font-bold money">{formatMoney(Number(loan.capital))}</p></div>
          {Number(loan.comision) > 0 && <div><p className="text-muted-foreground">Comisión</p><p className="font-bold text-orange-600 money">-{formatMoney(Number(loan.comision))}</p></div>}
          {loan.descuentoRenovacion && Number(loan.descuentoRenovacion) > 0 && (
            <div><p className="text-muted-foreground">Descuento renovación</p><p className="font-bold text-orange-600 money">-{formatMoney(Number(loan.descuentoRenovacion))}</p></div>
          )}
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

      {/* Renovación anticipada */}
      {puedeRenovar && pagosFinanciados && (
        <LoanRenewButton
          loanId={loan.id}
          tipo={loan.tipo as LoanType}
          pagosRealizados={pagados}
          umbral={umbral}
          pagosFinanciados={pagosFinanciados}
          montoFinanciado={
            loan.tipo === 'AGIL'
              ? Number(loan.pagoDiario) * pagosFinanciados
              : loan.tipo === 'FIDUCIARIO'
              ? Number(loan.pagoQuincenal) * pagosFinanciados
              : Number(loan.pagoSemanal) * pagosFinanciados
          }
          clientId={loan.client.id}
          clientNombre={loan.client.nombreCompleto}
          cobradorId={loan.cobradorId}
          branchId={loan.branchId}
        />
      )}

      {/* Checklist de documentos */}
      <DocumentChecklist
        loanId={loan.id}
        tipo={loan.tipo as LoanType}
        savedChecklist={(loan.documentChecklist as ChecklistItem[] | null) ?? null}
      />

      {/* Calendario de pagos */}
      {loan.schedule.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Calendario de pagos</span>
              <div className="flex items-center gap-2">
                {puedeEditarFechas && (
                  <span className="text-xs text-amber-600 font-normal">Haz clic en el lápiz para editar fechas</span>
                )}
                <span className="text-sm font-normal text-muted-foreground">{pagados}/{loan.schedule.length} pagados</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScheduleDateEditor
              loanId={loan.id}
              schedule={loan.schedule.map((s) => ({
                id: s.id,
                numeroPago: s.numeroPago,
                fechaVencimiento: s.fechaVencimiento,
                montoEsperado: Number(s.montoEsperado),
                estado: s.estado as ScheduleStatus,
              }))}
              canCapture={puedeCapturar}
              canEditDates={puedeEditarFechas}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
