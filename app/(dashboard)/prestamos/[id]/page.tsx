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
import { ArrowLeft, ShieldAlert, AlertTriangle, Info } from 'lucide-react'
import Link from 'next/link'
import type { LoanStatus, LoanType, ScheduleStatus, Prisma } from '@prisma/client'
import { findAvalMatches, getAvalRiskLevel } from '@/lib/aval-check'

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

  const { companyId, rol, branchId, id: userId } = session.user

  // Scope loan access by role — prevents cross-coordinator data leakage
  const loanWhere: Prisma.LoanWhereInput = { id: params.id, companyId: companyId! }
  if (rol === 'COORDINADOR' || rol === 'COBRADOR') {
    loanWhere.cobradorId = userId
  } else if (rol === 'GERENTE') {
    const branchIds = session.user.zonaBranchIds?.length
      ? session.user.zonaBranchIds
      : branchId ? [branchId] : null
    if (branchIds?.length) loanWhere.branchId = { in: branchIds }
  } else if (rol === 'GERENTE_ZONAL') {
    const zoneIds = session.user.zonaBranchIds
    if (zoneIds?.length) loanWhere.branchId = { in: zoneIds }
  }

  // Leer permisoAplicarPagos directo de BD — evita problemas de caché en el JWT
  const userPermisos = await prisma.user.findUnique({
    where: { id: userId },
    select: { permisoAplicarPagos: true },
  })

  const loan = await prisma.loan.findFirst({
    where: loanWhere,
    include: {
      client: { select: { id: true, nombreCompleto: true, telefono: true, score: true } },
      cobrador: { select: { nombre: true } },
      aprobadoPor: { select: { nombre: true } },
      loanOriginal: { select: { id: true, loanGroupId: true } },
      schedule: { orderBy: { numeroPago: 'asc' } },
    },
  })

  // Para DG y SUPER_ADMIN: construir mapa de quién y cuándo cobró/aplicó cada pago
  type PaymentInfo = { quien: string; rol: string; cuando: string }
  let paymentInfoMap: Record<string, PaymentInfo> = {}

  type ChecklistItem = { id: string; label: string; checked: boolean }

  if (!loan) notFound()

  // Check if the client applying for this loan is a guarantor (aval) for someone else
  const avalMatches = loan.estado === 'PENDING_APPROVAL'
    ? await findAvalMatches(loan.client.nombreCompleto, loan.client.telefono, companyId!)
    : []
  const avalRiskLevel = getAvalRiskLevel(avalMatches)

  const ESTADO_LABELS: Record<string, string> = {
    ACTIVE: 'Activo',
    PENDING_APPROVAL: 'Pendiente',
    DEFAULTED: 'Incumplido',
    RESTRUCTURED: 'Reestructurado',
  }

  // Construir paymentInfoMap para TODOS los roles (quien cobró / aplicó)
  if (loan.schedule.length > 0) {
    const scheduleIds = loan.schedule.map((s) => s.id)

    // Pagos capturados por coordinador/cobrador (crean un registro Payment)
    const pagos = await prisma.payment.findMany({
      where: { scheduleId: { in: scheduleIds } },
      select: {
        scheduleId: true,
        fechaHora: true,
        cobrador: { select: { nombre: true, rol: true } },
      },
      orderBy: { fechaHora: 'desc' },
    })
    for (const p of pagos) {
      if (p.scheduleId && !paymentInfoMap[p.scheduleId]) {
        paymentInfoMap[p.scheduleId] = {
          quien: p.cobrador.nombre,
          rol: p.cobrador.rol,
          cuando: p.fechaHora.toISOString(),
        }
      }
    }

    // Pagos aplicados manualmente por DG (sin Payment record — solo AuditLog)
    const audits = await prisma.auditLog.findMany({
      where: {
        tabla: 'PaymentSchedule',
        accion: 'DG_APPLY_PAYMENT',
        registroId: { in: scheduleIds },
      },
      select: {
        registroId: true,
        createdAt: true,
        user: { select: { nombre: true, rol: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    for (const a of audits) {
      if (a.registroId && !paymentInfoMap[a.registroId] && a.user) {
        paymentInfoMap[a.registroId] = {
          quien: a.user.nombre,
          rol: a.user.rol,
          cuando: a.createdAt.toISOString(),
        }
      }
    }
  }

  // Para SOLIDARIO pendiente de aprobación: cargar todos los integrantes del grupo
  let grupoMiembros: Array<{ loanId: string; clientNombre: string; capital: number }> | undefined
  if (
    loan.tipo === 'SOLIDARIO' &&
    loan.estado === 'PENDING_APPROVAL' &&
    (rol === 'DIRECTOR_GENERAL' || rol === 'SUPER_ADMIN') &&
    loan.loanGroupId
  ) {
    // Crédito nuevo solidario: cargar todos los integrantes del grupo
    const siblings = await prisma.loan.findMany({
      where: { loanGroupId: loan.loanGroupId, companyId: companyId! },
      include: { client: { select: { nombreCompleto: true } } },
      orderBy: { createdAt: 'asc' },
    })
    grupoMiembros = siblings.map((s) => ({
      loanId: s.id,
      clientNombre: s.client.nombreCompleto,
      capital: Number(s.capital),
    }))
  } else if (
    loan.tipo === 'SOLIDARIO' &&
    loan.estado === 'PENDING_APPROVAL' &&
    (rol === 'DIRECTOR_GENERAL' || rol === 'SUPER_ADMIN') &&
    loan.loanOriginalId
  ) {
    // Renovación solidaria: rastrear el grupo original y cargar las renovaciones de los demás miembros
    const originalGroupId = loan.loanOriginal?.loanGroupId ?? null
    if (originalGroupId) {
      const originalLoans = await prisma.loan.findMany({
        where: { loanGroupId: originalGroupId, companyId: companyId! },
        select: { id: true },
      })
      const renewalLoans = await prisma.loan.findMany({
        where: {
          loanOriginalId: { in: originalLoans.map((l) => l.id) },
          estado: 'PENDING_APPROVAL',
          companyId: companyId!,
        },
        include: { client: { select: { nombreCompleto: true } } },
        orderBy: { createdAt: 'asc' },
      })
      grupoMiembros = renewalLoans.map((r) => ({
        loanId: r.id,
        clientNombre: r.client.nombreCompleto,
        capital: Number(r.capital),
      }))
    }
  }

  const pagados = loan.schedule.filter((s) => s.estado === 'PAID').length

  // Determinar si aplica renovación anticipada
  const umbral = UMBRAL_RENOVACION[loan.tipo]
  const pagosFinanciados = PAGOS_FINANCIADOS[loan.tipo]
  const puedeRenovar =
    loan.estado === 'ACTIVE' &&
    umbral !== undefined &&
    pagados >= umbral &&
    (rol === 'COORDINADOR' || rol === 'COBRADOR' || rol === 'GERENTE_ZONAL' || rol === 'GERENTE')

  // Roles que pueden activar un crédito APPROVED — coordinador, gerente (tienen clientes propios) y SUPER_ADMIN
  const puedeActivar =
    loan.estado === 'APPROVED' &&
    (rol === 'COORDINADOR' || rol === 'GERENTE' || rol === 'SUPER_ADMIN')

  // Director General y SUPER_ADMIN: pueden editar fechas en cualquier estado,
  // incluyendo filas PAID, y pueden deshacer pagos.
  const esOpAdmin = rol === 'DIRECTOR_GENERAL' || rol === 'SUPER_ADMIN'

  // Leer permiso directo de BD (no del JWT) para evitar problemas de caché
  const tienePermisoAplicar = userPermisos?.permisoAplicarPagos === true

  const puedeEditarFechas = esOpAdmin
  const puedeDeshacerPago = esOpAdmin || tienePermisoAplicar

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

          {/* Alerta de aval — si el cliente es garantía de otro préstamo con riesgo */}
          {loan.estado === 'PENDING_APPROVAL' && avalMatches.length > 0 && (
            <div className={`rounded-lg p-3 border ${
              avalRiskLevel === 'red'
                ? 'bg-red-50 border-red-400'
                : avalRiskLevel === 'yellow'
                ? 'bg-yellow-50 border-yellow-400'
                : 'bg-blue-50 border-blue-300'
            }`}>
              <div className="flex items-start gap-2">
                {avalRiskLevel === 'red' ? (
                  <ShieldAlert className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                ) : avalRiskLevel === 'yellow' ? (
                  <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                ) : (
                  <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                )}
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${
                    avalRiskLevel === 'red' ? 'text-red-800' : avalRiskLevel === 'yellow' ? 'text-yellow-800' : 'text-blue-800'
                  }`}>
                    {avalRiskLevel === 'red'
                      ? 'ALERTA: Este cliente es aval de un préstamo con riesgo alto'
                      : avalRiskLevel === 'yellow'
                      ? 'Advertencia: Este cliente es aval de un préstamo con atraso'
                      : 'Info: Este cliente aparece como aval en otro préstamo'}
                  </p>
                  <div className="mt-1.5 space-y-1">
                    {avalMatches.map((m) => (
                      <div key={m.loanId} className="text-sm flex items-center gap-2">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: m.scoreColor }}
                        />
                        <span>
                          Aval de <strong>{m.clienteNombre}</strong> — {m.loanTipo} {ESTADO_LABELS[m.loanEstado] ?? m.loanEstado} — Score: {m.clienteScore} ({m.scoreLabel})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Director General: aprobar / contrapropuesta / rechazar */}
          {loan.estado === 'PENDING_APPROVAL' && (rol === 'DIRECTOR_GENERAL' || rol === 'SUPER_ADMIN') && (
            <LoanApprovalActions
              loanId={loan.id}
              tipo={loan.tipo}
              capital={Number(loan.capital)}
              tasaInteres={loan.tasaInteres ? Number(loan.tasaInteres) : undefined}
              grupoMiembros={grupoMiembros}
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
                <LoanActivateButton
                  loanId={loan.id}
                  fechaDesembolsoDG={loan.fechaDesembolso ? loan.fechaDesembolso.toISOString().slice(0, 10) : null}
                  fechaPrimerPagoDG={loan.fechaPrimerPago ? loan.fechaPrimerPago.toISOString().slice(0, 10) : null}
                />
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
          {esOpAdmin && (
            <div><p className="text-muted-foreground">Interés</p><p className="font-bold money">{formatMoney(Number(loan.interes))}</p></div>
          )}
          {/* Interés por período (ganancia semanal/diaria/quincenal) — solo DG y SA */}
          {esOpAdmin && (
            <div>
              <p className="text-muted-foreground">
                {loan.tipo === 'AGIL' ? 'Interés diario' : loan.tipo === 'FIDUCIARIO' ? 'Interés quincenal' : 'Interés semanal'}
              </p>
              <p className="font-bold money">{formatMoney(Number(loan.interes) / loan.plazo)}</p>
            </div>
          )}
          {/* Pago por período — aparece junto a Interés semanal para que los 3 campos queden en el mismo row del grid */}
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
          {/* Tasa (pago_por_mil / xc_por_mil) — solo DG y SA */}
          {esOpAdmin && Number(loan.tasaInteres) > 0 && (
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
                pagadoAt: s.pagadoAt ?? null,
                paymentInfo: paymentInfoMap[s.id],
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
