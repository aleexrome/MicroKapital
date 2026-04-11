import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { ApprovalBadge } from '@/components/loans/ApprovalBadge'
import { LoanApprovalActions } from '@/components/loans/LoanApprovalActions'
import { LoanActivateButton } from '@/components/loans/LoanActivateButton'
import { LoanClientRejectButton } from '@/components/loans/LoanClientRejectButton'
import { LoanRenewButton } from '@/components/loans/LoanRenewButton'
import { DocumentChecklist } from '@/components/loans/DocumentChecklist'
import { LoanDocumentUpload } from '@/components/loans/LoanDocumentUpload'
import { ScheduleDateEditor } from '@/components/loans/ScheduleDateEditor'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatMoney, formatDate } from '@/lib/utils'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import type { LoanStatus, LoanType, ScheduleStatus } from '@prisma/client'
import { isOperationsAdmin } from '@/lib/permissions'

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

  const esOpAdmin = isOperationsAdmin(session.user.email, rol)

  // Operations admin puede editar cualquier fecha en cualquier estado de crédito.
  // Director General solo puede editar en créditos activos (filas no pagadas).
  const puedeEditarFechas = esOpAdmin || (loan.estado === 'ACTIVE' && rol === 'DIRECTOR_GENERAL')

  // Solo el Operations Admin (Stephanie) puede deshacer pagos
  const puedeDeshacerPago = esOpAdmin

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
          {puedeActivar && !loan.seguroPendiente && (
            <div className="pt-1 space-y-2">
              <p className="text-sm text-blue-700 font-medium">
                Crédito aprobado por el Director General. Preséntalo al cliente y actívalo si acepta.
              </p>
              {loan.requiereDocumentos && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-300 flex items-start gap-2">
                  <span className="text-amber-400 font-bold mt-0.5">⚠</span>
                  <span>El Director General solicitó documentación completa antes de activar. Sube todos los archivos en la sección de documentos de abajo.</span>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <LoanActivateButton loanId={loan.id} />
                <LoanClientRejectButton loanId={loan.id} />
              </div>
            </div>
          )}

          {/* Gerente: verificar transferencia del seguro y activar */}
          {loan.seguroPendiente && (rol === 'GERENTE' || rol === 'GERENTE_ZONAL' || rol === 'SUPER_ADMIN') && (
            <div className="pt-1">
              <LoanActivateButton loanId={loan.id} seguroPendiente />
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
          {/* Interés por período (int_semanal / ga_semanal / pct_diario) */}
          <div>
            <p className="text-muted-foreground">
              {loan.tipo === 'AGIL' ? 'Interés diario' : loan.tipo === 'FIDUCIARIO' ? 'Interés quincenal' : 'Interés semanal'}
            </p>
            <p className="font-bold money">{formatMoney(Number(loan.interes) / loan.plazo)}</p>
          </div>
          <div><p className="text-muted-foreground">Total a pagar</p><p className="font-bold text-primary-700 money">{formatMoney(Number(loan.totalPago))}</p></div>
          {/* Saldo vigente: suma de pagos pendientes */}
          {loan.schedule.some((s) => s.estado !== 'PAID') && (
            <div>
              <p className="text-muted-foreground">Saldo vigente</p>
              <p className="font-bold text-blue-700 money">
                {formatMoney(
                  loan.schedule
                    .filter((s) => s.estado !== 'PAID')
                    .reduce((sum, s) => sum + Number(s.montoEsperado), 0)
                )}
              </p>
            </div>
          )}
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
          {/* Tasa (pago_por_mil / xc_por_mil) */}
          {Number(loan.tasaInteres) > 0 && (
            <div>
              <p className="text-muted-foreground">Tasa</p>
              <p className="font-semibold">{Number(loan.tasaInteres).toFixed(4)} x/mil</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground">Plazo</p>
            <p className="font-semibold">{loan.plazo} {loan.tipo === 'AGIL' ? 'días hábiles' : loan.tipo === 'FIDUCIARIO' ? 'quincenas' : 'semanas'}</p>
          </div>
          {/* Día de cobro (hora_pago) */}
          {loan.diaPago && (
            <div>
              <p className="text-muted-foreground">Día de cobro</p>
              <p className="font-semibold capitalize">{loan.diaPago.toLowerCase()}</p>
            </div>
          )}
          <div><p className="text-muted-foreground">Cobrador</p><p className="font-semibold">{loan.cobrador.nombre}</p></div>
          {loan.fechaDesembolso && <div><p className="text-muted-foreground">Desembolso</p><p className="font-semibold">{formatDate(loan.fechaDesembolso)}</p></div>}
          {loan.aprobadoPor && <div><p className="text-muted-foreground">Aprobado por</p><p className="font-semibold">{loan.aprobadoPor.nombre}</p></div>}
          {loan.seguro && Number(loan.seguro) > 0 && (
            <div>
              <p className="text-muted-foreground">Seguro de apertura</p>
              <p className="font-semibold text-indigo-700">
                {formatMoney(Number(loan.seguro))}
                {loan.seguroPendiente && <span className="ml-1 text-xs text-amber-600">(por verificar)</span>}
              </p>
            </div>
          )}
          {loan.avalNombre && (
            <div>
              <p className="text-muted-foreground">Aval</p>
              <p className="font-semibold">{loan.avalNombre}{loan.avalRelacion ? ` (${loan.avalRelacion})` : ''}</p>
              {loan.avalTelefono && <p className="text-xs text-muted-foreground">{loan.avalTelefono}</p>}
            </div>
          )}
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

      {/* Archivos PDF del crédito */}
      <LoanDocumentUpload
        loanId={loan.id}
        tipo={loan.tipo as LoanType}
        readOnly={rol === 'DIRECTOR_COMERCIAL' || rol === 'DIRECTOR_GENERAL'}
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
              canUndo={puedeDeshacerPago}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
