'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/use-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScheduleDateEditor } from './ScheduleDateEditor'
import { formatMoney, formatDate } from '@/lib/utils'
import { ChevronDown, ChevronRight, Loader2, Undo2, CheckCircle2, AlertCircle, RefreshCw, Info } from 'lucide-react'
import type { ScheduleStatus } from '@prisma/client'

const ROL_LABEL: Record<string, string> = {
  DIRECTOR_GENERAL:   'Director General',
  DIRECTOR_COMERCIAL: 'Director Comercial',
  GERENTE_ZONAL:      'Gerente Zonal',
  GERENTE:            'Gerente',
  COORDINADOR:        'Coordinador',
  COBRADOR:           'Cobrador',
  SUPER_ADMIN:        'Super Admin',
}

interface ScheduleItem {
  id: string
  numeroPago: number
  fechaVencimiento: Date | string
  montoEsperado: number
  montoPagado: number
  estado: ScheduleStatus
  pagadoAt?: Date | string | null
}

interface LoanEntry {
  id: string
  clientId: string
  clientNombre: string
  capital: number
  pagoSemanal: number | null
  schedule: ScheduleItem[]
}

interface GroupRow {
  numeroPago: number
  fechaVencimiento: Date | string
  montoGrupal: number
  montoPagadoGrupal: number
  estado: 'PAID' | 'PARTIAL' | 'PENDING' | 'OVERDUE'
  pagados: number
  total: number
}

function computeGroupRows(loans: LoanEntry[]): GroupRow[] {
  const byNumero = new Map<number, { schedules: ScheduleItem[]; fecha: Date | string }>()

  for (const loan of loans) {
    for (const s of loan.schedule) {
      if (!byNumero.has(s.numeroPago)) {
        byNumero.set(s.numeroPago, { schedules: [], fecha: s.fechaVencimiento })
      }
      byNumero.get(s.numeroPago)!.schedules.push(s)
    }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const rows: GroupRow[] = []
  const entries = Array.from(byNumero.entries()).sort(([a], [b]) => a - b)
  for (const [numeroPago, { schedules, fecha }] of entries) {
    const montoGrupal       = schedules.reduce((s: number, i: ScheduleItem) => s + i.montoEsperado, 0)
    const montoPagadoGrupal = schedules.reduce((s: number, i: ScheduleItem) => s + i.montoPagado, 0)
    const pagados           = schedules.filter((i: ScheduleItem) => i.estado === 'PAID' || i.estado === 'ADVANCE').length
    const total             = schedules.length

    const _d     = typeof fecha === 'string' ? new Date(fecha) : fecha
    const dueDate = new Date(_d.getUTCFullYear(), _d.getUTCMonth(), _d.getUTCDate())

    let estado: GroupRow['estado']
    if (pagados === total) {
      estado = 'PAID'
    } else if (pagados > 0) {
      estado = 'PARTIAL'
    } else if (dueDate < today) {
      estado = 'OVERDUE'
    } else {
      estado = 'PENDING'
    }

    rows.push({ numeroPago, fechaVencimiento: fecha, montoGrupal, montoPagadoGrupal, estado, pagados, total })
  }

  return rows
}

const GROUP_STATUS_VARIANT: Record<GroupRow['estado'], 'success' | 'info' | 'warning' | 'error'> = {
  PAID:    'success',
  PARTIAL: 'info',
  PENDING: 'warning',
  OVERDUE: 'error',
}
const GROUP_STATUS_LABEL: Record<GroupRow['estado'], string> = {
  PAID:    'Pagado',
  PARTIAL: 'Parcial',
  PENDING: 'Pendiente',
  OVERDUE: 'Vencido',
}

interface MemberRenewalData {
  loanId: string
  clientNombre: string
  currentCapital: number
  pagosFinanciadosCount: number
  montoFinanciado: number
}

/** Para el ícono "i" de quién/cuándo se aplicó cada pago. Viene del
 *  server component (solo se construye para DG/DC/SA). */
interface PaymentInfo {
  quien: string
  rol: string
  cuando: string
}

interface Props {
  groupId: string
  loans: LoanEntry[]
  canActGroup: boolean   // DIRECTOR_GENERAL / SUPER_ADMIN
  canRenewGroup?: boolean
  memberRenewalData?: MemberRenewalData[]
  paymentInfoMap?: Record<string, PaymentInfo>
  /**
   * Quién/cuándo aplicó cada pago grupal (numeroPago → info). Solo
   * llega lleno para DG/DC/SA — controla la visibilidad del ícono "i"
   * en el Calendario grupal.
   */
  groupPaymentInfoMap?: Record<number, PaymentInfo>
}

export function GrupoCalendar({
  groupId, loans, canActGroup, canRenewGroup, memberRenewalData, paymentInfoMap, groupPaymentInfoMap,
}: Props) {
  const router    = useRouter()
  const { toast } = useToast()

  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set())
  const [confirmApply, setConfirmApply]       = useState<number | null>(null)
  const [confirmUndo,  setConfirmUndo]        = useState<number | null>(null)
  const [loadingApply, setLoadingApply]       = useState(false)
  const [loadingUndo,  setLoadingUndo]        = useState(false)
  /** Para abrir/cerrar el detalle del ícono "i" en cada fila grupal. */
  const [openGroupInfo, setOpenGroupInfo]     = useState<number | null>(null)

  const [renewOpen,    setRenewOpen]    = useState(false)
  const [renewLoading, setRenewLoading] = useState(false)
  const [capitales,    setCapitales]    = useState<Record<string, string>>(() =>
    memberRenewalData
      ? Object.fromEntries(memberRenewalData.map((m) => [m.loanId, m.currentCapital.toString()]))
      : {}
  )

  const groupRows = computeGroupRows(loans)

  function toggleClient(loanId: string) {
    setExpandedClients((prev) => {
      const next = new Set(prev)
      next.has(loanId) ? next.delete(loanId) : next.add(loanId)
      return next
    })
  }

  async function applyGroup(numeroPago: number) {
    setLoadingApply(true)
    try {
      const res  = await fetch(`/api/loan-groups/${groupId}/schedule/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numeroPago }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error')
      toast({ title: data.message ?? `Pago ${numeroPago} aplicado al grupo` })
      setConfirmApply(null)
      router.refresh()
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
    } finally {
      setLoadingApply(false)
    }
  }

  async function undoGroup(numeroPago: number) {
    setLoadingUndo(true)
    try {
      const res  = await fetch(`/api/loan-groups/${groupId}/schedule/undo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numeroPago }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error')
      toast({ title: data.message ?? `Pago ${numeroPago} revertido en el grupo` })
      setConfirmUndo(null)
      router.refresh()
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
    } finally {
      setLoadingUndo(false)
    }
  }

  async function handleGroupRenew() {
    if (!memberRenewalData) return

    for (const m of memberRenewalData) {
      const cap = parseFloat(capitales[m.loanId] ?? '')
      if (!cap || cap <= 0) {
        toast({ title: 'Error', description: `Capital inválido para ${m.clientNombre}`, variant: 'destructive' })
        return
      }
    }

    setRenewLoading(true)
    try {
      await Promise.all(
        memberRenewalData.map(async (m) => {
          const res = await fetch(`/api/loans/${m.loanId}/renew`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ capital: parseFloat(capitales[m.loanId] ?? '0') }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(`${m.clientNombre}: ${data.error ?? 'Error'}`)
        })
      )
      toast({
        title: '✅ Solicitud de renovación grupal enviada',
        description: 'Pendiente de aprobación del Director General',
      })
      setRenewOpen(false)
      router.refresh()
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' })
    } finally {
      setRenewLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Nivel 1: Calendario grupal ────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Calendario grupal</span>
            <span className="text-sm font-normal text-muted-foreground">
              {groupRows.filter((r) => r.estado === 'PAID').length}/{groupRows.length} semanas pagadas
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {groupRows.map((row) => {
              const canApplyRow = canActGroup && row.estado !== 'PAID'
              const canUndoRow  = canActGroup && row.estado === 'PAID'
              const isOverdue   = row.estado === 'OVERDUE'
              const groupInfo   = groupPaymentInfoMap?.[row.numeroPago]
              const infoOpen    = openGroupInfo === row.numeroPago

              return (
                <div
                  key={row.numeroPago}
                  className={isOverdue ? 'bg-red-500/5' : ''}
                >
                  <div className="px-4 py-3 text-sm flex items-center gap-2 flex-wrap">
                  <span className={`w-7 shrink-0 font-medium ${isOverdue ? 'text-red-400' : 'text-muted-foreground'}`}>
                    {row.numeroPago}.
                  </span>

                  <span className={`w-24 shrink-0 flex items-center gap-1 ${isOverdue ? 'text-red-400 font-medium' : ''}`}>
                    {formatDate(row.fechaVencimiento)}
                    {isOverdue && <AlertCircle className="h-3 w-3 text-red-400 shrink-0" />}
                  </span>

                  <span className="font-semibold w-20 shrink-0">
                    {formatMoney(row.montoGrupal)}
                  </span>

                  <Badge variant={GROUP_STATUS_VARIANT[row.estado]} className="text-xs shrink-0">
                    {GROUP_STATUS_LABEL[row.estado]}
                  </Badge>

                  <span className="text-xs text-muted-foreground">
                    {row.pagados}/{row.total}
                    {row.estado === 'PARTIAL' && (
                      <> · <span className="text-emerald-400">{formatMoney(row.montoPagadoGrupal)}</span> de {formatMoney(row.montoGrupal)}</>
                    )}
                  </span>

                  {/* Ícono "i": quién aplicó este pago grupal — solo cuando llegó info (DG/DC/SA) */}
                  {row.estado === 'PAID' && groupInfo && (
                    <button
                      type="button"
                      onClick={() => setOpenGroupInfo(infoOpen ? null : row.numeroPago)}
                      title="Ver quién aplicó este pago grupal"
                      className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  )}

                  {/* Aplicar todos */}
                  {canApplyRow && (
                    <div className="ml-auto shrink-0">
                      {confirmApply === row.numeroPago ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-emerald-400">¿Aplicar a todos?</span>
                          <Button
                            size="sm"
                            variant="success"
                            className="h-6 px-2 text-xs"
                            disabled={loadingApply}
                            onClick={() => applyGroup(row.numeroPago)}
                          >
                            {loadingApply ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Sí'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-xs"
                            disabled={loadingApply}
                            onClick={() => setConfirmApply(null)}
                          >No</Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmApply(row.numeroPago)}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-emerald-400 transition-colors border border-dashed border-border/50 rounded px-2 py-1 hover:border-emerald-400/50"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          Aplicar todos
                        </button>
                      )}
                    </div>
                  )}

                  {/* Deshacer todos */}
                  {canUndoRow && (
                    <div className="ml-auto shrink-0">
                      {confirmUndo === row.numeroPago ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-amber-400">¿Revertir grupo?</span>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-6 px-2 text-xs"
                            disabled={loadingUndo}
                            onClick={() => undoGroup(row.numeroPago)}
                          >
                            {loadingUndo ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Sí'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-xs"
                            disabled={loadingUndo}
                            onClick={() => setConfirmUndo(null)}
                          >No</Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmUndo(row.numeroPago)}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-amber-400 transition-colors border border-dashed border-border/50 rounded px-2 py-1 hover:border-amber-400/50"
                        >
                          <Undo2 className="h-3 w-3" />
                          Deshacer grupo
                        </button>
                      )}
                    </div>
                  )}
                  </div>

                  {/* Panel de info: quién/cuándo aplicó el pago grupal */}
                  {infoOpen && groupInfo && (
                    <div className="mx-4 mb-3 rounded-md bg-sky-500/10 border border-sky-500/20 px-3 py-2 text-xs space-y-1">
                      <p>
                        <span className="font-semibold">Registrado por:</span>{' '}
                        {groupInfo.quien}{' '}
                        <span className="text-sky-300">({ROL_LABEL[groupInfo.rol] ?? groupInfo.rol})</span>
                      </p>
                      <p>
                        <span className="font-semibold">Fecha y hora:</span>{' '}
                        {new Date(groupInfo.cuando).toLocaleString('es-MX', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Renovación Grupal Anticipada ──────────────────────────────── */}
      {canRenewGroup && memberRenewalData && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2 text-green-800">
                <RefreshCw className="h-4 w-4" />
                Renovación Anticipada Disponible
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setRenewOpen(!renewOpen)}>
                  {renewOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </Button>
              </div>
            </CardTitle>
          </CardHeader>

          {renewOpen && (
            <CardContent className="space-y-4">
              {/* Info */}
              <div className="bg-white rounded-lg p-3 border border-green-100 text-sm">
                <div className="flex items-start gap-2 text-green-700">
                  <Info className="h-4 w-4 mt-0.5 shrink-0" />
                  <p>
                    Crédito <strong>Solidario</strong> elegible desde pago 6.
                    La empresa financia los <strong>últimos {memberRenewalData[0]?.pagosFinanciadosCount ?? 2} pagos</strong> de
                    cada integrante — el monto se descuenta del capital entregado.
                  </p>
                </div>
              </div>

              {/* Capital por integrante */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Capital del nuevo crédito por integrante</p>
                {memberRenewalData.map((m) => (
                  <div key={m.loanId} className="flex items-center gap-3">
                    <span className="flex-1 text-sm text-green-800 truncate">{m.clientNombre}</span>
                    {m.montoFinanciado > 0 && (
                      <span className="text-xs text-orange-600 shrink-0">
                        -{formatMoney(m.montoFinanciado)} financiado
                      </span>
                    )}
                    <div className="relative w-32 shrink-0">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-green-600 text-xs">$</span>
                      <input
                        type="number"
                        min={100}
                        step={500}
                        className="border border-green-300 rounded pl-5 pr-2 py-1.5 text-sm w-full bg-white"
                        value={capitales[m.loanId] ?? ''}
                        onChange={(e) => setCapitales((prev) => ({ ...prev, [m.loanId]: e.target.value }))}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  disabled={renewLoading}
                  onClick={handleGroupRenew}
                >
                  {renewLoading
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <><RefreshCw className="h-4 w-4 mr-1" />Solicitar renovación grupal</>
                  }
                </Button>
                <Button size="sm" variant="outline" onClick={() => setRenewOpen(false)}>Cancelar</Button>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* ── Nivel 2: Calendarios individuales ─────────────────────────── */}
      <div>
        <h2 className="text-base font-semibold mb-3">Calendarios por integrante</h2>
        <div className="space-y-2">
          {loans.map((loan) => {
            const isExpanded = expandedClients.has(loan.id)
            const pagadosCount = loan.schedule.filter((s) => s.estado === 'PAID' || s.estado === 'ADVANCE').length

            return (
              <div key={loan.id} className="border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleClient(loan.id)}
                  className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                >
                  {isExpanded
                    ? <ChevronDown  className="h-4 w-4 shrink-0 text-muted-foreground" />
                    : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  }
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{loan.clientNombre}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>Monto: <span className="font-medium">{formatMoney(loan.capital)}</span></span>
                      {loan.pagoSemanal !== null && (
                        <>
                          <span>·</span>
                          <span>Pago: <span className="font-medium">{formatMoney(loan.pagoSemanal)}</span></span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {pagadosCount}/{loan.schedule.length} pagados
                  </span>
                </button>

                {isExpanded && (
                  <div className="border-t px-4 py-3">
                    <ScheduleDateEditor
                      loanId={loan.id}
                      schedule={loan.schedule.map((s) => ({
                        id:               s.id,
                        numeroPago:       s.numeroPago,
                        fechaVencimiento: s.fechaVencimiento,
                        montoEsperado:    s.montoEsperado,
                        estado:           s.estado,
                        pagadoAt:         s.pagadoAt ?? null,
                        paymentInfo:      paymentInfoMap?.[s.id],
                      }))}
                      canCapture={false}
                      canEditDates={canActGroup}
                      canUndo={canActGroup}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
