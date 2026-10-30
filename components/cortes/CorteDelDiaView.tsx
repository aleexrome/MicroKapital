'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Card } from '@/components/ui/card'
import { Loader2, Plus, Package, CheckCircle2, Clock, AlertCircle, Upload, ChevronDown, ChevronUp } from 'lucide-react'
import { EntregarParcialDialog } from './EntregarParcialDialog'
import { EntregarConsolidadoDialog } from './EntregarConsolidadoDialog'
import { ConfirmarConsolidadoDialog } from './ConfirmarConsolidadoDialog'
import { AceptarParcialButton } from './AceptarParcialButton'
import { RechazarParcialButton } from './RechazarParcialButton'
import { TimelineDia } from './TimelineDia'
import { ParcialPrintButton } from './ParcialPrintButton'
import { ConsolidadoPrintButton } from './ConsolidadoPrintButton'
import { HistoricoCortes } from './HistoricoCortes'
import { CancelarCorteButton } from './CancelarCorteButton'

type Receptor = { id: string; nombre: string; rol: string }
type Corte = {
  id: string
  fecha: string
  createdAt: string
  numeroCorte: number
  tipo: 'PARCIAL' | 'CONSOLIDADO'
  estado: 'ABIERTO' | 'ENTREGADO' | 'ACEPTADO' | 'RECHAZADO'
  totalAEntregar: string
  totalEfectivoCobrado: string
  totalRecibidoDeOtros: string
  fotoTicketUrl: string | null
  transferenciaFotoUrl: string | null
  metodoEntregaFinal: 'EFECTIVO_FIRMADO' | 'TRANSFERENCIA' | null
  entregadoAt: string | null
  aceptadoAt: string | null
  rechazadoAt: string | null
  rechazoRazon: string | null
  receptor?: Receptor | null
  user?: { id: string; nombre: string; rol: string }
  branch?: { id: string; nombre: string }
  consolidadoHijos?: Array<{ id: string; numeroCorte: number; totalAEntregar: string; user: { nombre: string } }>
}

type ParcialDetalle = {
  corteId: string
  pagosClientes: Array<{
    id: string
    clienteNombre: string
    monto: number
    metodoPago: string
    numeroPago: number | null
    fechaHora: string
  }>
  parcialesIngesta: Array<{
    id: string
    numeroCorte: number
    total: number
    userNombre: string
    aceptadoAt: string | null
  }>
}

interface Props {
  userId: string
  userNombre: string
  userRol: string
  branchNombre: string
  esConcentradora: boolean
  sinConcentradora: boolean
  concentradora: { id: string; nombre: string } | null
  parcialesPropios: Corte[]
  parcialesDetalle: ParcialDetalle[]
  consolidadosPropios: Corte[]
  parcialesEntregadosRecibidos: Corte[]
  parcialesParaConsolidar: Array<{ id: string; userId: string; montoAceptado: number }>
  consolidadosPendientesConfirmar: Corte[]
  receptoresValidos: Receptor[]
  snapIncremental: { efectivo: number; tarjeta: number; transferencia: number; recibidoDeOtros: number }
  cortesTimeline: Corte[]
  cortesHistoricos: Corte[]
  esViernes: boolean
  efectivoPropioSemana: { efectivo: number; tarjeta: number; transferencia: number; desde: string }
  desgloseDelDia: {
    transferPendiente:       number
    transferPendienteCount:  number
    comisionApertura:        number
    comisionAperturaCount:   number
    seguroApertura:          number
    seguroAperturaCount:     number
  }
}

function money(n: string | number) {
  return `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function estadoBadge(estado: Corte['estado']) {
  const cfg = {
    ABIERTO:   { bg: 'bg-amber-500/15 text-amber-400 border-amber-500/30',       icon: Clock,       label: 'Abierto' },
    ENTREGADO: { bg: 'bg-sky-500/15 text-sky-400 border-sky-500/30',             icon: Package,     label: 'Entregado' },
    ACEPTADO:  { bg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', icon: CheckCircle2, label: 'Aceptado' },
    RECHAZADO: { bg: 'bg-red-500/15 text-red-400 border-red-500/30',             icon: AlertCircle, label: 'Rechazado' },
  }[estado]
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${cfg.bg}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  )
}

export function CorteDelDiaView(props: Props) {
  const {
    userId, userNombre, userRol, branchNombre, esConcentradora, sinConcentradora, concentradora,
    parcialesPropios, parcialesDetalle, consolidadosPropios, parcialesEntregadosRecibidos,
    parcialesParaConsolidar, consolidadosPendientesConfirmar,
    receptoresValidos, snapIncremental, cortesTimeline, cortesHistoricos,
    esViernes, efectivoPropioSemana, desgloseDelDia,
  } = props
  const detalleMap = new Map(parcialesDetalle.map((d) => [d.corteId, d]))
  const [parcialExpandido, setParcialExpandido] = useState<string | null>(null)

  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState<string | null>(null)
  const [entregarParcial, setEntregarParcial] = useState<Corte | null>(null)
  const [entregarConsolidado, setEntregarConsolidado] = useState<Corte | null>(null)
  const [confirmarConsolidado, setConfirmarConsolidado] = useState<Corte | null>(null)

  const esReceptor = ['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'SUPER_ADMIN'].includes(userRol)
  const hacesCorte = !esReceptor
  const puedeConsolidar = (esConcentradora || sinConcentradora) && hacesCorte
  // Auditoría de desglose: DG/DC/SA + MC. Resto solo ve chips de color.
  const canAudit = ['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'SUPER_ADMIN', 'MESA_CONTROL'].includes(userRol)

  async function iniciarParcial() {
    setLoading('iniciarParcial')
    try {
      const r = await fetch('/api/cortes/parcial/iniciar', { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error ?? `Error ${r.status}`)
      toast({
        title: '✅ Parcial abierto',
        description: d.autoAceptado
          ? `Parcial #${d.numeroCorte} auto-aceptado (eres tu propia concentradora)`
          : `Parcial #${d.numeroCorte} abierto. Imprime ticket y entrégalo.`,
      })
      router.refresh()
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Error al abrir parcial', variant: 'destructive' })
    } finally { setLoading(null) }
  }

  async function iniciarConsolidado() {
    setLoading('iniciarConsolidado')
    try {
      const r = await fetch('/api/cortes/consolidado/iniciar', { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error ?? `Error ${r.status}`)
      toast({
        title: '✅ Consolidado abierto',
        description: `${d.parcialesCount} parciales agrupados · Total ${money(d.totalAEntregar)}. Entrégalo a DG/DC.`,
      })
      router.refresh()
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
    } finally { setLoading(null) }
  }

  const puedeAbrirParcial = (snapIncremental.efectivo + snapIncremental.recibidoDeOtros) > 0
  const totalColectado = parcialesPropios.filter(p => p.estado !== 'RECHAZADO').reduce((s, p) => s + Number(p.totalAEntregar), 0)

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Corte del día</h1>
        <p className="text-sm text-muted-foreground">
          {hacesCorte
            ? puedeConsolidar
              ? 'Como concentradora acumulas los parciales de los coords de tu sucursal durante la semana y los consolidas (junto con tu propio efectivo) los viernes para entregarlos a Dirección.'
              : 'Abre cuantos parciales necesites durante el día. Cada parcial se entrega a tu concentradora.'
            : 'Confirma recepción de los consolidados que te entregan.'}
        </p>
      </div>

      {/* ─── Confirmaciones pendientes (DG/DC/SA) ─────────────────────── */}
      {esReceptor && consolidadosPendientesConfirmar.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-500">
            Consolidados por confirmar ({consolidadosPendientesConfirmar.length})
          </h2>
          <div className="grid gap-3">
            {consolidadosPendientesConfirmar.map((c) => (
              <Card key={c.id} className="p-4 border-amber-500/40 bg-amber-500/5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-semibold">{c.user?.nombre}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">{c.branch?.nombre}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">
                        {c.metodoEntregaFinal === 'TRANSFERENCIA' ? '💳 Transferencia' : '💵 Efectivo firmado'}
                      </span>
                    </div>
                    <div className="text-2xl font-bold tabular-nums">{money(c.totalAEntregar)}</div>
                    <div className="text-xs text-muted-foreground">
                      Agrupa {c.consolidadoHijos?.length ?? 0} parciales
                    </div>
                  </div>
                  <Button onClick={() => setConfirmarConsolidado(c)}>
                    Revisar y confirmar
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* ─── Parciales que me entregaron (concentradora) ──────────────── */}
      {esConcentradora && parcialesEntregadosRecibidos.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-sky-500">
            Parciales por aceptar ({parcialesEntregadosRecibidos.length})
          </h2>
          <div className="grid gap-2">
            {parcialesEntregadosRecibidos.map((c) => (
              <Card key={c.id} className="p-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium">
                      {c.user?.nombre} <span className="text-muted-foreground text-xs">#{c.numeroCorte}</span>
                    </div>
                    <div className="text-lg font-semibold tabular-nums">{money(c.totalAEntregar)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {c.fotoTicketUrl && (
                      <a href={c.fotoTicketUrl} target="_blank" rel="noreferrer" className="text-xs text-sky-500 hover:underline">
                        Ver ticket
                      </a>
                    )}
                    <RechazarParcialButton corteId={c.id} montoEsperado={Number(c.totalAEntregar)} />
                    <AceptarParcialButton corteId={c.id} montoEsperado={Number(c.totalAEntregar)} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* ─── Efectivo propio de la semana (solo concentradora) ────────── */}
      {puedeConsolidar && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Mi efectivo propio esta semana
          </h2>
          <Card className="p-4 bg-primary/5 border-primary/30">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-xs text-muted-foreground">Pendiente de consolidar</div>
                <div className="text-2xl font-bold tabular-nums">{money(efectivoPropioSemana.efectivo)}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  No necesitas abrir parciales. Al Iniciar consolidado el viernes el sistema registra este efectivo automáticamente y lo entrega junto con lo recibido de otros coords.
                </div>
              </div>
            </div>
          </Card>
        </section>
      )}

      {/* ─── Movimientos del día (todos los conceptos) ─────────────────
          Resumen informativo del día: efectivo nuevo, transferencias
          validadas y pendientes, comisiones y seguros cobrados en
          apertura. 'A entregar' solo cuenta efectivo físico — las
          transferencias pendientes NO se contabilizan hasta que el GZ
          las verifica. Los seguros/comisiones ya están incluidos en el
          efectivo cobrado; se listan aparte para auditar. */}
      {hacesCorte && (snapIncremental.efectivo + snapIncremental.tarjeta + snapIncremental.transferencia + desgloseDelDia.transferPendiente + desgloseDelDia.comisionApertura + desgloseDelDia.seguroApertura > 0) && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Movimientos del día
          </h2>
          <Card className="p-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
              <div>
                <p className="text-muted-foreground">Efectivo nuevo</p>
                <p className="font-semibold tabular-nums text-emerald-400">{money(snapIncremental.efectivo)}</p>
              </div>
              {snapIncremental.transferencia > 0 && (
                <div>
                  <p className="text-muted-foreground">Transf. validadas</p>
                  <p className="font-semibold tabular-nums text-sky-400">{money(snapIncremental.transferencia)}</p>
                </div>
              )}
              {desgloseDelDia.transferPendiente > 0 && (
                <div>
                  <p className="text-muted-foreground">
                    Transf. no validadas
                    <span className="ml-1 text-muted-foreground/70">({desgloseDelDia.transferPendienteCount})</span>
                  </p>
                  <p className="font-semibold tabular-nums text-amber-400">{money(desgloseDelDia.transferPendiente)}</p>
                  <p className="text-[10px] text-muted-foreground/80">Pendiente de verificar por GZ</p>
                </div>
              )}
              {snapIncremental.tarjeta > 0 && (
                <div>
                  <p className="text-muted-foreground">Tarjeta</p>
                  <p className="font-semibold tabular-nums">{money(snapIncremental.tarjeta)}</p>
                </div>
              )}
              {desgloseDelDia.comisionApertura > 0 && (
                <div>
                  <p className="text-muted-foreground">
                    Comisión apertura
                    <span className="ml-1 text-muted-foreground/70">({desgloseDelDia.comisionAperturaCount})</span>
                  </p>
                  <p className="font-semibold tabular-nums text-violet-400">{money(desgloseDelDia.comisionApertura)}</p>
                  <p className="text-[10px] text-muted-foreground/80">Incluido en efectivo</p>
                </div>
              )}
              {desgloseDelDia.seguroApertura > 0 && (
                <div>
                  <p className="text-muted-foreground">
                    Seguro apertura
                    <span className="ml-1 text-muted-foreground/70">({desgloseDelDia.seguroAperturaCount})</span>
                  </p>
                  <p className="font-semibold tabular-nums text-fuchsia-400">{money(desgloseDelDia.seguroApertura)}</p>
                  <p className="text-[10px] text-muted-foreground/80">Incluido en efectivo</p>
                </div>
              )}
            </div>
          </Card>
        </section>
      )}

      {/* ─── Mis parciales del día (coord — NO concentradora) ─────────── */}
      {hacesCorte && !puedeConsolidar && (
        <section className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Mis parciales de hoy ({parcialesPropios.length})
            </h2>
            <div className="flex items-center gap-2">
              <div className="text-xs text-muted-foreground">
                Disponible nuevo: <span className="font-semibold text-foreground">{money(snapIncremental.efectivo + snapIncremental.recibidoDeOtros)}</span>
              </div>
              <Button
                size="sm"
                disabled={!puedeAbrirParcial || loading === 'iniciarParcial'}
                onClick={iniciarParcial}
              >
                {loading === 'iniciarParcial' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Iniciar parcial
              </Button>
            </div>
          </div>

          {parcialesPropios.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              No has abierto ningún parcial hoy. Cuando juntes efectivo cobrado, aprieta <strong>Iniciar parcial</strong>.
            </Card>
          ) : (
            <div className="grid gap-2">
              {parcialesPropios.map((p) => {
                const detalle = detalleMap.get(p.id)
                const expandido = parcialExpandido === p.id
                const hayDesglose = !!detalle && (detalle.pagosClientes.length > 0 || detalle.parcialesIngesta.length > 0)
                return (
                <Card key={p.id} className="p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="font-mono text-xs text-muted-foreground min-w-[46px]">
                        #{p.numeroCorte}
                        <div className="text-[10px] opacity-70">
                          {new Date(p.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <div className="space-y-0.5">
                        <div className="text-lg font-semibold tabular-nums">{money(p.totalAEntregar)}</div>
                        <div className="text-xs text-muted-foreground">
                          Efectivo cobrado por ti: {money(p.totalEfectivoCobrado)}
                          {Number(p.totalRecibidoDeOtros) > 0 && (
                            <> · Recibido de coords de tu sucursal: {money(p.totalRecibidoDeOtros)}</>
                          )}
                        </div>
                        {hayDesglose && (
                          <button
                            type="button"
                            onClick={() => setParcialExpandido(expandido ? null : p.id)}
                            className="mt-1 text-[11px] text-primary hover:underline inline-flex items-center gap-1"
                          >
                            {expandido ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            {expandido ? 'Ocultar' : 'Ver'} desglose ({(detalle!.pagosClientes.length) + (detalle!.parcialesIngesta.length)})
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {estadoBadge(p.estado)}
                      {(p.estado === 'ABIERTO' || p.estado === 'RECHAZADO') && (
                        <ParcialPrintButton
                          parcial={p}
                          cobradorNombre={userNombre}
                          sucursalNombre={branchNombre}
                          receptorNombre={concentradora?.nombre ?? p.receptor?.nombre}
                          pagos={detalle?.pagosClientes.map((pc) => ({
                            clienteNombre: pc.clienteNombre,
                            monto:         pc.monto,
                            metodoPago:    pc.metodoPago,
                            numeroPago:    pc.numeroPago,
                          }))}
                        />
                      )}
                      {p.estado === 'ABIERTO' && (
                        <>
                          <CancelarCorteButton corteId={p.id} tipo="PARCIAL" />
                          <Button size="sm" variant="default" onClick={() => setEntregarParcial(p)}>
                            <Upload className="h-3.5 w-3.5" /> Entregar
                          </Button>
                        </>
                      )}
                      {p.estado === 'RECHAZADO' && (
                        <Button size="sm" variant="outline" onClick={() => setEntregarParcial(p)}>
                          Re-entregar
                        </Button>
                      )}
                      {p.estado === 'ENTREGADO' && p.receptor && (
                        <span className="text-xs text-muted-foreground">esperando a {p.receptor.nombre}</span>
                      )}
                    </div>
                  </div>
                  {p.estado === 'RECHAZADO' && p.rechazoRazon && (
                    <div className="mt-2 text-xs text-red-400">Rechazado: {p.rechazoRazon}</div>
                  )}
                  {expandido && detalle && (
                    <div className="pt-2 border-t border-border/50 space-y-1">
                      {detalle.pagosClientes.length > 0 && (
                        <>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Cobros propios ({detalle.pagosClientes.length})
                          </div>
                          {detalle.pagosClientes.map((pc) => (
                            <div key={pc.id} className="flex justify-between text-xs">
                              <span className="truncate">
                                {new Date(pc.fechaHora).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} ·{' '}
                                {pc.clienteNombre}
                                {pc.numeroPago != null && <span className="text-muted-foreground"> ·#{pc.numeroPago}</span>}
                                <span className="text-muted-foreground ml-1">
                                  ({pc.metodoPago === 'CASH' ? 'efectivo' : pc.metodoPago === 'CARD' ? 'tarjeta' : 'transf.'})
                                </span>
                              </span>
                              <span className="tabular-nums font-medium shrink-0">{money(pc.monto)}</span>
                            </div>
                          ))}
                        </>
                      )}
                      {detalle.parcialesIngesta.length > 0 && (
                        <>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-2">
                            Parciales recibidos de otros coords ({detalle.parcialesIngesta.length})
                          </div>
                          {detalle.parcialesIngesta.map((pi) => (
                            <div key={pi.id} className="flex justify-between text-xs">
                              <span className="truncate">
                                {pi.aceptadoAt && (
                                  <>
                                    {new Date(pi.aceptadoAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} ·{' '}
                                  </>
                                )}
                                {pi.userNombre} <span className="text-muted-foreground">parcial #{pi.numeroCorte}</span>
                              </span>
                              <span className="tabular-nums font-medium shrink-0">{money(pi.total)}</span>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </Card>
                )
              })}
              <div className="text-right text-sm text-muted-foreground">
                Total aceptado hoy: <span className="font-semibold text-foreground">{money(totalColectado)}</span>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ─── Mis consolidados (concentradora) ─────────────────────────── */}
      {puedeConsolidar && (
        <section className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Consolidados a DG/DC ({consolidadosPropios.length})
            </h2>
            <Button
              size="sm"
              disabled={!esViernes || parcialesParaConsolidar.length === 0 || loading === 'iniciarConsolidado'}
              onClick={iniciarConsolidado}
              title={!esViernes ? 'Los consolidados se arman los viernes' : ''}
            >
              {loading === 'iniciarConsolidado' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
              {esViernes
                ? `Iniciar consolidado (${parcialesParaConsolidar.length} disponibles)`
                : `Disponible viernes (${parcialesParaConsolidar.length} parciales de la semana)`}
            </Button>
          </div>

          {consolidadosPropios.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              {esViernes
                ? parcialesParaConsolidar.length > 0
                  ? `Hoy es viernes — tienes ${parcialesParaConsolidar.length} parciales de la semana listos para consolidar y entregar a Dirección.`
                  : 'Hoy es viernes pero no hay parciales acumulados esta semana.'
                : parcialesParaConsolidar.length > 0
                  ? `Llevas ${parcialesParaConsolidar.length} parciales acumulados esta semana. Los consolidarás y entregarás a Dirección el viernes.`
                  : 'Cuando aceptes parciales de los coords podrás consolidarlos y entregarlos el viernes.'}
            </Card>
          ) : (
            <div className="grid gap-2">
              {consolidadosPropios.map((c) => (
                <Card key={c.id} className="p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="space-y-0.5">
                      <div className="text-xs text-muted-foreground">
                        Consolidado #{c.numeroCorte}
                        <span className="opacity-70 ml-1">
                          · {new Date(c.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="text-lg font-semibold tabular-nums">{money(c.totalAEntregar)}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.consolidadoHijos?.length ?? 0} parciales
                        {c.metodoEntregaFinal && ` · ${c.metodoEntregaFinal === 'TRANSFERENCIA' ? '💳 Transf.' : '💵 Efectivo'}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {estadoBadge(c.estado)}
                      {(c.estado === 'ABIERTO' || c.estado === 'RECHAZADO') && (
                        <>
                          <ConsolidadoPrintButton
                            consolidado={c}
                            concentradoraNombre={userNombre}
                            sucursalNombre={branchNombre}
                          />
                          {c.estado === 'ABIERTO' && (
                            <CancelarCorteButton corteId={c.id} tipo="CONSOLIDADO" />
                          )}
                          <Button size="sm" onClick={() => setEntregarConsolidado(c)}>
                            <Upload className="h-3.5 w-3.5" />
                            {c.estado === 'RECHAZADO' ? 'Re-entregar' : 'Entregar a DG/DC'}
                          </Button>
                        </>
                      )}
                      {c.estado === 'ENTREGADO' && c.receptor && (
                        <span className="text-xs text-muted-foreground">esperando a {c.receptor.nombre}</span>
                      )}
                    </div>
                  </div>
                  {c.consolidadoHijos && c.consolidadoHijos.length > 0 && (
                    <div className="pt-2 border-t border-border/50 space-y-0.5">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Desglose</div>
                      {c.consolidadoHijos.map((h) => (
                        <div key={h.id} className="flex justify-between text-xs">
                          <span className="truncate">
                            {h.user.nombre}
                            <span className="text-muted-foreground ml-1">· parcial #{h.numeroCorte}</span>
                          </span>
                          <span className="tabular-nums font-medium shrink-0">{money(h.totalAEntregar)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {c.estado === 'RECHAZADO' && c.rechazoRazon && (
                    <div className="text-xs text-red-400">Rechazado: {c.rechazoRazon}</div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ─── Timeline del día ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Línea del día {esReceptor ? '(todas las sucursales)' : ''}
        </h2>
        <TimelineDia cortes={cortesTimeline} userId={userId} canAudit={canAudit} />
      </section>

      {/* ─── Histórico de días pasados ───────────────────────────────── */}
      <HistoricoCortes cortes={cortesHistoricos} canAudit={canAudit} />

      {/* Dialogs */}
      {entregarParcial && (
        <EntregarParcialDialog
          corte={entregarParcial}
          receptores={receptoresValidos}
          concentradoraDefault={concentradora}
          onClose={() => setEntregarParcial(null)}
        />
      )}
      {entregarConsolidado && (
        <EntregarConsolidadoDialog
          corte={entregarConsolidado}
          receptores={receptoresValidos}
          onClose={() => setEntregarConsolidado(null)}
        />
      )}
      {confirmarConsolidado && (
        <ConfirmarConsolidadoDialog
          corte={confirmarConsolidado}
          onClose={() => setConfirmarConsolidado(null)}
        />
      )}
    </div>
  )
}
