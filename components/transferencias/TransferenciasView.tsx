'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { formatMoney, formatDateTime } from '@/lib/utils'
import { CheckCircle, Loader2, Building2, Clock, ShieldCheck, Search, Filter, X, AlertCircle, MessageSquare } from 'lucide-react'
import type { UserRole } from '@prisma/client'

export interface TransferRow {
  id: string
  monto: string
  fechaHora: string
  idTransferencia: string | null
  statusTransferencia: string | null
  verificadoAt: string | null
  cuentaDestino: { banco: string; titular: string; clabe: string } | null
  cobrador: { nombre: string }
  cobradorId: string
  verificadoPor: { nombre: string } | null
  client: { nombreCompleto: string }
  loan: { tipo: string }
  /** Este viewer puede verificar ESTA fila específica (respeta la flag
   *  verificacionCentralizada de la sucursal del préstamo). */
  puedeVerificar: boolean
  sucursalNombre: string
  /** Fase 1 validación: cuando el pago se registró con el flujo nuevo,
   *  idTransferencia es el código MK-XXXXXX y comprobanteFotoUrl trae
   *  el screenshot que subió la coord. Legacy = ambos null. */
  comprobanteFotoUrl?: string | null
  /** Número / ID del banco (autorización SPEI) que capturó el coord
   *  opcionalmente. Pista extra para auditoría. */
  referenciaBanco?: string | null
  // Aclaración solicitada por el verificador (ver endpoint
  // /api/payments/[id]/request-clarification). Mientras hay aclaración
  // abierta sin responder, la fila NO aparece en "Pendientes" sino en
  // la tab "Aclaración".
  aclaracionSolicitadaAt: string | null
  aclaracionNota: string | null
  aclaracionRespuesta: string | null
  aclaracionRespondidaAt: string | null
  aclaracionSolicitadaPor: { nombre: string } | null
}

interface Props {
  rows: TransferRow[]
  puedeVerificar: boolean
  rol: UserRole
  userId: string
}

export function TransferenciasView({ rows, puedeVerificar, rol, userId }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [processing, setProcessing] = useState<string | null>(null)
  // Diálogos de aclaración — guardan la row target. Null = cerrado.
  const [solicitarAclaracionDe, setSolicitarAclaracionDe] = useState<TransferRow | null>(null)
  const [responderAclaracionDe, setResponderAclaracionDe] = useState<TransferRow | null>(null)

  // Para MC y GZ mostramos solo las transferencias (pendientes y
  // verificadas) que caen en las sucursales que ellos deben atender —
  // así la vista es una bandeja limpia por rol.
  // DG/DC/SUPER_ADMIN ven todo como referencia global.
  const esAdmin = rol === 'DIRECTOR_GENERAL' || rol === 'DIRECTOR_COMERCIAL' || rol === 'SUPER_ADMIN'
  const mostrarFiltros = esAdmin || rol === 'MESA_CONTROL'
  const enScope = (r: TransferRow) => esAdmin || r.puedeVerificar

  // ── Filtros (solo para DG/DC/SA/MC) ─────────────────────────────────
  // El estado se guarda plano en useState — no vale la pena reducer para
  // 6 controles. Los coord/gerentes no ven el panel y por tanto el filtro
  // queda en su valor default (todo pasa).
  const [q, setQ] = useState('')
  const [branchFilter, setBranchFilter] = useState<string>('__ALL__')
  const [cobradorFilter, setCobradorFilter] = useState<string>('__ALL__')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [orden, setOrden] = useState<'fecha-desc' | 'fecha-asc' | 'monto-desc' | 'monto-asc'>('fecha-desc')
  // Tab activa: reemplaza el select de "Estado" que estaba en el panel
  // de filtros — es mas obvio visualmente cambiar entre pendientes /
  // verificadas / todas.
  const [activeTab, setActiveTab] = useState<'PENDIENTE' | 'ACLARACION' | 'VERIFICADO' | 'TODAS'>('PENDIENTE')

  // Opciones para los dropdowns — solo lo que aparece en las filas del scope.
  const sucursales = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) if (enScope(r)) set.add(r.sucursalNombre)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, esAdmin])
  const cobradores = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) if (enScope(r)) set.add(r.cobrador.nombre)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, esAdmin])

  const filtroActivo = q.trim() !== ''
    || branchFilter !== '__ALL__'
    || cobradorFilter !== '__ALL__'
    || fechaDesde !== ''
    || fechaHasta !== ''
  function resetFiltros() {
    setQ('')
    setBranchFilter('__ALL__')
    setCobradorFilter('__ALL__')
    setFechaDesde('')
    setFechaHasta('')
  }

  // Un solo pipeline: filtrar + ordenar. Los conteos por tab
  // (pendientes / verificadas / todas) se sacan del mismo resultado
  // para que respeten los filtros activos.
  const filtradasOrdenadas = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const desde = fechaDesde ? new Date(fechaDesde + 'T00:00:00') : null
    const hasta = fechaHasta ? new Date(fechaHasta + 'T23:59:59') : null
    const filtered = rows.filter((r) => {
      if (!enScope(r)) return false
      if (branchFilter !== '__ALL__' && r.sucursalNombre !== branchFilter) return false
      if (cobradorFilter !== '__ALL__' && r.cobrador.nombre !== cobradorFilter) return false
      if (desde || hasta) {
        const d = new Date(r.fechaHora)
        if (desde && d < desde) return false
        if (hasta && d > hasta) return false
      }
      if (needle) {
        const hay = `${r.client.nombreCompleto} ${r.idTransferencia ?? ''} ${r.cobrador.nombre}`
          .toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
    filtered.sort((a, b) => {
      switch (orden) {
        case 'fecha-asc':  return new Date(a.fechaHora).getTime() - new Date(b.fechaHora).getTime()
        case 'monto-desc': return Number(b.monto) - Number(a.monto)
        case 'monto-asc':  return Number(a.monto) - Number(b.monto)
        case 'fecha-desc':
        default:           return new Date(b.fechaHora).getTime() - new Date(a.fechaHora).getTime()
      }
    })
    return filtered
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, branchFilter, cobradorFilter, fechaDesde, fechaHasta, orden, esAdmin])

  // Clasificación:
  //   - aclaracionPendienteRespuesta: PENDIENTE con aclaración abierta
  //     (el coord debe responder). No vuelven a "Pendientes" hasta responder.
  //   - pendientes: PENDIENTE normal (listo para verificar) + aclaraciones
  //     ya respondidas (vuelven al verificador).
  //   - verificadas: ya VERIFICADO.
  const enAclaracion = filtradasOrdenadas.filter(
    (r) => r.statusTransferencia === 'PENDIENTE'
        && r.aclaracionSolicitadaAt
        && !r.aclaracionRespondidaAt
  )
  const pendientes = filtradasOrdenadas.filter(
    (r) => r.statusTransferencia === 'PENDIENTE'
        && (!r.aclaracionSolicitadaAt || r.aclaracionRespondidaAt)
  )
  const verificadas = filtradasOrdenadas.filter((r) => r.statusTransferencia === 'VERIFICADO')
  const visibles = activeTab === 'PENDIENTE'  ? pendientes
    : activeTab === 'ACLARACION'              ? enAclaracion
    : activeTab === 'VERIFICADO'              ? verificadas
    : filtradasOrdenadas

  async function handleVerify(paymentId: string) {
    setProcessing(paymentId)
    try {
      const res = await fetch('/api/payments/verify-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Error al verificar')
      }
      toast({ title: '✅ Transferencia verificada', description: 'El pago se aplicó al calendario' })
      router.refresh()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      })
    } finally {
      setProcessing(null)
    }
  }

  async function enviarSolicitudAclaracion(paymentId: string, nota: string) {
    setProcessing(paymentId)
    try {
      const res = await fetch(`/api/payments/${paymentId}/request-clarification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nota }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Error al solicitar aclaración')
      toast({ title: '✅ Aclaración solicitada', description: 'El coordinador fue notificado' })
      setSolicitarAclaracionDe(null)
      router.refresh()
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' })
    } finally { setProcessing(null) }
  }

  async function enviarRespuestaAclaracion(paymentId: string, body: { respuesta: string; idTransferencia?: string; referenciaBanco?: string }) {
    setProcessing(paymentId)
    try {
      const res = await fetch(`/api/payments/${paymentId}/resolve-clarification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Error al responder')
      toast({ title: '✅ Respuesta enviada', description: 'El verificador fue notificado' })
      setResponderAclaracionDe(null)
      router.refresh()
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' })
    } finally { setProcessing(null) }
  }

  const esDirector = rol === 'DIRECTOR_GENERAL' || rol === 'DIRECTOR_COMERCIAL'
  const esCoordinador = rol === 'COORDINADOR' || rol === 'COBRADOR'

  const subtitulo = puedeVerificar
    ? 'Confirma que el dinero llegó a la cuenta antes de aplicar el pago al calendario.'
    : esDirector
    ? 'Historial y seguimiento de transferencias — quién las validó y cuándo.'
    : esCoordinador
    ? 'Estado de las transferencias capturadas: pendientes y ya verificadas por el gerente.'
    : 'Transferencias capturadas y su estado de validación.'

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Transferencias</h1>
        <p className="text-muted-foreground">{subtitulo}</p>
      </div>

      {/* ── FILTROS ────────────────────────────────────────────────────── */}
      {mostrarFiltros && (
        <Card className="glass-hover-card">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filtros</span>
              <span className="text-xs text-muted-foreground">
                {filtradasOrdenadas.length} resultado{filtradasOrdenadas.length !== 1 ? 's' : ''}
              </span>
              {filtroActivo && (
                <button
                  type="button"
                  onClick={resetFiltros}
                  className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <X className="h-3 w-3" /> Limpiar filtros
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Búsqueda */}
              <div className="space-y-1 lg:col-span-2">
                <Label className="text-xs">Buscar cliente / referencia / cobrador</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Nombre, referencia..."
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              {/* Sucursal */}
              <div className="space-y-1">
                <Label className="text-xs">Sucursal</Label>
                <select
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="__ALL__">Todas</option>
                  {sucursales.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {/* Cobrador */}
              <div className="space-y-1">
                <Label className="text-xs">Cobrador</Label>
                <select
                  value={cobradorFilter}
                  onChange={(e) => setCobradorFilter(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="__ALL__">Todos</option>
                  {cobradores.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {/* Rango de fechas */}
              <div className="space-y-1">
                <Label className="text-xs">Desde</Label>
                <Input
                  type="date"
                  value={fechaDesde}
                  onChange={(e) => setFechaDesde(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hasta</Label>
                <Input
                  type="date"
                  value={fechaHasta}
                  onChange={(e) => setFechaHasta(e.target.value)}
                />
              </div>
              {/* Orden */}
              <div className="space-y-1">
                <Label className="text-xs">Ordenar por</Label>
                <select
                  value={orden}
                  onChange={(e) => setOrden(e.target.value as typeof orden)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="fecha-desc">Más reciente</option>
                  <option value="fecha-asc">Más antigua</option>
                  <option value="monto-desc">Monto (mayor a menor)</option>
                  <option value="monto-asc">Monto (menor a mayor)</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── TABS: Pendientes / Verificadas / Todas ─────────────────────── */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {([
          { key: 'PENDIENTE',  label: 'Pendientes',  count: pendientes.length,          icon: <Clock className="h-4 w-4" />,       color: 'text-yellow-500'  },
          { key: 'ACLARACION', label: 'Aclaración',  count: enAclaracion.length,        icon: <AlertCircle className="h-4 w-4" />, color: 'text-amber-500'   },
          { key: 'VERIFICADO', label: 'Verificadas', count: verificadas.length,         icon: <ShieldCheck className="h-4 w-4" />, color: 'text-emerald-500' },
          { key: 'TODAS',      label: 'Todas',       count: filtradasOrdenadas.length,  icon: null,                                color: 'text-gray-600'   },
        ] as const).map((tab) => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              {tab.icon && <span className={isActive ? tab.color : ''}>{tab.icon}</span>}
              <span>{tab.label}</span>
              <span className={`inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full text-xs font-semibold ${
                isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              }`}>
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── LISTADO — segun la tab activa ──────────────────────────────── */}
      {visibles.length === 0 ? (
        <Card className="glass-hover-card">
          <CardContent className="text-center py-10">
            {activeTab === 'PENDIENTE' ? (
              <>
                <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No hay transferencias pendientes de verificación</p>
              </>
            ) : activeTab === 'VERIFICADO' ? (
              <p className="text-sm text-muted-foreground">Aún no hay transferencias verificadas</p>
            ) : (
              <p className="text-sm text-muted-foreground">No hay transferencias con los filtros actuales</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibles.map((p) => {
            const esPendiente = p.statusTransferencia === 'PENDIENTE'
            const enAclaracionAbierta = !!p.aclaracionSolicitadaAt && !p.aclaracionRespondidaAt
            const puedoResponderAclaracion = enAclaracionAbierta && (
              p.cobradorId === userId
              || rol === 'DIRECTOR_GENERAL' || rol === 'DIRECTOR_COMERCIAL' || rol === 'SUPER_ADMIN'
            )
            return (
              <Card
                key={p.id}
                className={
                  enAclaracionAbierta ? 'border-amber-500/40 bg-amber-500/5'
                  : esPendiente       ? 'border-yellow-500/20 bg-yellow-500/5'
                  : ''
                }
              >
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {enAclaracionAbierta ? (
                          <>
                            <AlertCircle className="h-4 w-4 text-amber-500" />
                            <Badge variant="secondary" className="bg-amber-500/15 text-amber-200 border-amber-500/40">Requiere aclaración</Badge>
                          </>
                        ) : esPendiente ? (
                          <>
                            <Clock className="h-4 w-4 text-yellow-500" />
                            <Badge variant="secondary">Pendiente</Badge>
                            {p.aclaracionRespondidaAt && (
                              <Badge variant="secondary" className="bg-sky-500/15 text-sky-200 border-sky-500/40">Respondido</Badge>
                            )}
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="h-4 w-4 text-emerald-500" />
                            <Badge variant="success">Verificada</Badge>
                          </>
                        )}
                        <span className="font-semibold text-sm">{p.client.nombreCompleto}</span>
                      </div>
                      <div className="text-sm text-gray-700 space-y-0.5">
                        <p><span className="text-muted-foreground">Monto:</span> <span className="font-semibold money">{formatMoney(Number(p.monto))}</span></p>
                        <p><span className="text-muted-foreground">Cobrador:</span> {p.cobrador.nombre}</p>
                        <p><span className="text-muted-foreground">Capturado:</span> {formatDateTime(p.fechaHora)}</p>
                        {p.idTransferencia && (
                          // Si el idTransferencia empieza con "MK-" es el código
                          // Fase 1 (generado por el sistema); lo destacamos para
                          // que el verificador lo busque visualmente en la foto.
                          p.idTransferencia.startsWith('MK-') ? (
                            <p>
                              <span className="text-muted-foreground">Código esperado en concepto:</span>{' '}
                              <span className="font-mono font-bold text-fuchsia-600 bg-fuchsia-50 px-1.5 py-0.5 rounded">
                                {p.idTransferencia}
                              </span>
                            </p>
                          ) : (
                            <p>
                              <span className="text-muted-foreground">Referencia:</span>{' '}
                              <span className="font-mono">{p.idTransferencia}</span>
                            </p>
                          )
                        )}
                        {p.cuentaDestino && (
                          <p className="flex items-center gap-1">
                            <Building2 className="h-3 w-3 text-muted-foreground" />
                            {p.cuentaDestino.banco} — CLABE: {p.cuentaDestino.clabe}
                          </p>
                        )}
                        {p.referenciaBanco && (
                          <p>
                            <span className="text-muted-foreground">Ref. banco:</span>{' '}
                            <span className="font-mono">{p.referenciaBanco}</span>
                          </p>
                        )}
                        <p><span className="text-muted-foreground">Sucursal:</span> {p.sucursalNombre}</p>
                        {p.comprobanteFotoUrl && (
                          <div className="mt-2">
                            <p className="text-xs text-muted-foreground mb-1">Comprobante subido por la coordinadora:</p>
                            <a href={p.comprobanteFotoUrl} target="_blank" rel="noreferrer" className="inline-block">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={p.comprobanteFotoUrl}
                                alt="Comprobante de transferencia"
                                className="max-h-48 rounded-md border border-border hover:border-primary-500 transition-colors cursor-zoom-in"
                              />
                            </a>
                          </div>
                        )}
                        {!esPendiente && (
                          <p className="pt-1 mt-1 border-t border-border text-emerald-600">
                            <span className="text-muted-foreground">Validada por:</span>{' '}
                            <span className="font-medium">{p.verificadoPor?.nombre ?? '—'}</span>
                            {p.verificadoAt && (
                              <> · {formatDateTime(p.verificadoAt)}</>
                            )}
                          </p>
                        )}
                        {/* Historial de aclaración si existe */}
                        {p.aclaracionNota && (
                          <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs space-y-1">
                            <p className="flex items-center gap-1 text-amber-200 font-medium">
                              <AlertCircle className="h-3 w-3" />
                              Aclaración solicitada
                              {p.aclaracionSolicitadaPor && (
                                <span className="text-muted-foreground font-normal">
                                  por {p.aclaracionSolicitadaPor.nombre}
                                </span>
                              )}
                            </p>
                            <p className="text-amber-100">{p.aclaracionNota}</p>
                            {p.aclaracionRespuesta && (
                              <div className="pt-1 mt-1 border-t border-amber-500/20">
                                <p className="flex items-center gap-1 text-sky-200 font-medium">
                                  <MessageSquare className="h-3 w-3" />
                                  Respuesta del coord
                                </p>
                                <p className="text-sky-100">{p.aclaracionRespuesta}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      {esPendiente && !enAclaracionAbierta && p.puedeVerificar && (
                        <>
                          <Button
                            size="sm"
                            variant="success"
                            disabled={!!processing}
                            onClick={() => handleVerify(p.id)}
                          >
                            {processing === p.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <><CheckCircle className="h-4 w-4" /> Verificar</>}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-amber-500/40 text-amber-200 hover:bg-amber-500/10"
                            disabled={!!processing}
                            onClick={() => setSolicitarAclaracionDe(p)}
                          >
                            <AlertCircle className="h-4 w-4" /> Solicitar aclaración
                          </Button>
                        </>
                      )}
                      {esPendiente && !p.puedeVerificar && puedeVerificar && (
                        <span className="text-xs italic text-muted-foreground">
                          Verifica Dirección / Mesa de Control
                        </span>
                      )}
                      {enAclaracionAbierta && puedoResponderAclaracion && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-sky-500/40 text-sky-200 hover:bg-sky-500/10"
                          disabled={!!processing}
                          onClick={() => setResponderAclaracionDe(p)}
                        >
                          <MessageSquare className="h-4 w-4" /> Responder y re-enviar
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Dialog: solicitar aclaración (verificador) */}
      {solicitarAclaracionDe && (
        <SolicitarAclaracionDialog
          row={solicitarAclaracionDe}
          busy={processing === solicitarAclaracionDe.id}
          onCancel={() => setSolicitarAclaracionDe(null)}
          onSubmit={(nota) => enviarSolicitudAclaracion(solicitarAclaracionDe.id, nota)}
        />
      )}

      {/* Dialog: responder aclaración (coord/admin) */}
      {responderAclaracionDe && (
        <ResponderAclaracionDialog
          row={responderAclaracionDe}
          busy={processing === responderAclaracionDe.id}
          onCancel={() => setResponderAclaracionDe(null)}
          onSubmit={(body) => enviarRespuestaAclaracion(responderAclaracionDe.id, body)}
        />
      )}
    </div>
  )
}

/* ────────────────────────────── Dialogs ────────────────────────────── */

function SolicitarAclaracionDialog({
  row, busy, onCancel, onSubmit,
}: {
  row: TransferRow
  busy: boolean
  onCancel: () => void
  onSubmit: (nota: string) => void
}) {
  const [nota, setNota] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !busy && onCancel()}>
      <div className="w-full max-w-md rounded-2xl bg-card border border-border/60 shadow-xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-400" /> Solicitar aclaración
          </h3>
          <button onClick={() => !busy && onCancel()} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="text-sm text-muted-foreground">
          <strong className="text-foreground">{row.client.nombreCompleto}</strong> — {formatMoney(Number(row.monto))} · {row.cobrador.nombre}
        </div>
        <p className="text-xs text-muted-foreground">
          Describe qué no cuadra para que el coordinador lo revise. Al enviar, el pago se saca de "Pendientes" y pasa a "Aclaración" hasta que el coord responda.
        </p>
        <div className="space-y-1">
          <Label className="text-xs">Motivo</Label>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder='Ej. "No veo el depósito en la cuenta", "El código MK- no aparece en el concepto", "La foto no se lee bien"'
            rows={4}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
            disabled={busy}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>Cancelar</Button>
          <Button
            variant="default"
            onClick={() => onSubmit(nota.trim())}
            disabled={busy || nota.trim().length < 5}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertCircle className="h-4 w-4" />}
            Enviar solicitud
          </Button>
        </div>
      </div>
    </div>
  )
}

function ResponderAclaracionDialog({
  row, busy, onCancel, onSubmit,
}: {
  row: TransferRow
  busy: boolean
  onCancel: () => void
  onSubmit: (body: { respuesta: string; idTransferencia?: string; referenciaBanco?: string }) => void
}) {
  const [respuesta, setRespuesta] = useState('')
  const [nuevaRef, setNuevaRef] = useState(row.idTransferencia ?? '')
  const [nuevaRefBanco, setNuevaRefBanco] = useState(row.referenciaBanco ?? '')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !busy && onCancel()}>
      <div className="w-full max-w-md rounded-2xl bg-card border border-border/60 shadow-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-sky-400" /> Responder aclaración
          </h3>
          <button onClick={() => !busy && onCancel()} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
          <p className="font-medium text-amber-200 mb-1">Lo que pidió el verificador:</p>
          <p>{row.aclaracionNota}</p>
        </div>
        <div className="text-sm text-muted-foreground">
          <strong className="text-foreground">{row.client.nombreCompleto}</strong> — {formatMoney(Number(row.monto))}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Tu respuesta</Label>
          <textarea
            value={respuesta}
            onChange={(e) => setRespuesta(e.target.value)}
            placeholder='Ej. "Revisé el extracto, el depósito está en el siguiente movimiento con otra fecha-hora"'
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
            disabled={busy}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Referencia / código (opcional, corrige si hace falta)</Label>
          <Input value={nuevaRef} onChange={(e) => setNuevaRef(e.target.value)} disabled={busy} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Ref. banco / autorización SPEI (opcional)</Label>
          <Input value={nuevaRefBanco} onChange={(e) => setNuevaRefBanco(e.target.value)} disabled={busy} />
        </div>
        <p className="text-xs text-muted-foreground">
          Al enviar, el pago vuelve a "Pendientes" para que el verificador revise con tu respuesta.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>Cancelar</Button>
          <Button
            variant="default"
            onClick={() => onSubmit({
              respuesta:       respuesta.trim(),
              idTransferencia: nuevaRef.trim() && nuevaRef.trim() !== (row.idTransferencia ?? '') ? nuevaRef.trim() : undefined,
              referenciaBanco: nuevaRefBanco.trim() && nuevaRefBanco.trim() !== (row.referenciaBanco ?? '') ? nuevaRefBanco.trim() : undefined,
            })}
            disabled={busy || respuesta.trim().length < 5}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
            Enviar respuesta
          </Button>
        </div>
      </div>
    </div>
  )
}
