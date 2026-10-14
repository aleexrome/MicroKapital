'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Building, Globe2, Clock, CheckCircle2, AlertCircle, X, Info, Filter, Wifi, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { LanzarArqueoDialog } from './LanzarArqueoDialog'
import { ArqueoDetalleDialog, type ArqueoCapturaDTO } from './ArqueoDetalleDialog'

/** Un user con pantalla abierta cuyo último heartbeat llegó dentro de este
 *  umbral se considera "en línea". El heartbeat se envía cada 15s, así que
 *  30s deja margen por si uno se perdió. */
const ONLINE_THRESHOLD_MS = 30 * 1000
/** Cada cuánto el admin page re-fetchea los datos del server. */
const ADMIN_REFRESH_MS    = 15 * 1000

interface User {
  id:     string
  nombre: string
  rol:    string
  branch: { id: string; nombre: string } | null
}

interface Branch { id: string; nombre: string }

interface ArqueoDTO {
  id:             string
  tipo:           'INDIVIDUAL' | 'BRANCH' | 'GLOBAL'
  branchId:       string | null
  branchNombre:   string | null
  lanzadoAt:      string
  lanzadoPor:     { id: string; nombre: string; rol: string; branch: { nombre: string } | null } | null
  canceladoAt:    string | null
  canceladoPor:   { id: string; nombre: string } | null
  canceladoRazon: string | null
  capturas:       ArqueoCapturaDTO[]
}

interface Props {
  arqueos:  ArqueoDTO[]
  usuarios: User[]
  branches: Branch[]
  yoId:     string
}

type RangoFiltro = 'hoy' | 'semana' | 'todo'

const ROL_LABELS: Record<string, string> = {
  MESA_CONTROL: 'Mesa de Control',
  GERENTE_ZONAL: 'Gerente Zonal',
  GERENTE: 'Gerente',
  COORDINADOR: 'Coordinadora',
  COBRADOR: 'Cobrador',
}

/**
 * Vista principal de la pantalla admin de arqueos.
 *
 * Secciones:
 *   1. KPIs arriba (total / cumplidos / pendientes / suma diferencias).
 *   2. Botones "Arqueo global" + "Arqueo por sucursal".
 *   3. Grid de usuarios target — cada card con botón "Arqueo individual"
 *      y chips con los arqueos del user en el rango filtrado (click →
 *      ArqueoDetalleDialog).
 *
 * Filtros: Hoy / Semana MK / Todo + por sucursal.
 */
export function ArqueosView({ arqueos, usuarios, branches, yoId }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [rango, setRango]           = useState<RangoFiltro>('semana')
  const [branchId, setBranchId]     = useState<string>('')
  const [showLanzar, setShowLanzar] = useState<{
    tipo: 'INDIVIDUAL' | 'BRANCH' | 'GLOBAL'
    targetUser?: User
    branch?:     Branch
  } | null>(null)
  const [detalleCaptura, setDetalleCaptura] = useState<ArqueoCapturaDTO | null>(null)
  const [cancelando, setCancelando]           = useState<string | null>(null)
  const [liberandoCaptura, setLiberandoCaptura] = useState<string | null>(null)
  /** Tick que fuerza re-render cada 5s para que las etiquetas "visto hace Xs"
   *  avancen aunque el server no mande datos nuevos. */
  const [nowTick, setNowTick] = useState(() => Date.now())

  // Auto-refresh del server: trae el estado nuevo (heartbeats, capturas
  // completadas) cada ADMIN_REFRESH_MS. Usa router.refresh() para que el
  // RSC vuelva a correr y nos re-envíe el payload. Y tickeamos localmente
  // más seguido para que "visto hace Xs" se vea vivo.
  useEffect(() => {
    const refresh = setInterval(() => router.refresh(), ADMIN_REFRESH_MS)
    const tick    = setInterval(() => setNowTick(Date.now()), 5_000)
    return () => { clearInterval(refresh); clearInterval(tick) }
  }, [router])

  // Rango de fechas en función del filtro.
  const { desde } = useMemo(() => {
    const now = new Date()
    if (rango === 'hoy') {
      const d = new Date(now)
      d.setHours(0, 0, 0, 0)
      return { desde: d }
    }
    if (rango === 'semana') {
      // Semana MK = sábado 00:00 → viernes 23:59. getDay(): 0 dom, 6 sab.
      const dia = now.getDay()
      const diasDesdeSabado = dia === 6 ? 0 : dia + 1
      const sabado = new Date(now)
      sabado.setDate(now.getDate() - diasDesdeSabado)
      sabado.setHours(0, 0, 0, 0)
      return { desde: sabado }
    }
    return { desde: null }
  }, [rango])

  const arqueosFiltrados = useMemo(() => {
    return arqueos.filter((a) => {
      if (desde && new Date(a.lanzadoAt) < desde) return false
      if (branchId) {
        if (a.branchId === branchId) return true
        // Captura con user de esa sucursal
        return a.capturas.some((c) => c.user.branch?.id === branchId)
      }
      return true
    })
  }, [arqueos, desde, branchId])

  const kpi = useMemo(() => {
    let total = 0, cumplidos = 0, pendientes = 0, diferenciaTotal = 0
    for (const a of arqueosFiltrados) {
      for (const c of a.capturas) {
        total++
        if (c.capturadoAt) {
          cumplidos++
          const diffEf = (c.totalEfectivoDeclarado ?? 0) - (c.totalEfectivoEsperado ?? 0)
          const diffTr = (c.totalTransferenciasDeclarado ?? 0) - (c.totalTransferenciasEsperado ?? 0)
          diferenciaTotal += diffEf + diffTr
        } else if (!c.canceladoAt && !a.canceladoAt) {
          pendientes++
        }
      }
    }
    return { total, cumplidos, pendientes, diferenciaTotal }
  }, [arqueosFiltrados])

  // Capturas por user (para mostrar chips a la derecha del nombre).
  const capturasPorUser = useMemo(() => {
    const map = new Map<string, (ArqueoCapturaDTO & { arqueo: ArqueoDTO })[]>()
    for (const a of arqueosFiltrados) {
      for (const c of a.capturas) {
        const list = map.get(c.user.id) ?? []
        list.push({ ...c, arqueo: a })
        map.set(c.user.id, list)
      }
    }
    return map
  }, [arqueosFiltrados])

  // Captura PENDIENTE actual por user (SIN filtrar) — para el indicador
  // de presencia. Si filtramos por "Hoy" o por sucursal pero el arqueo
  // pendiente vive fuera, el badge aún así debe salir porque es lo que
  // está bloqueando al user AHORA MISMO.
  const pendienteActualPorUser = useMemo(() => {
    const map = new Map<string, ArqueoCapturaDTO & { arqueo: ArqueoDTO }>()
    for (const a of arqueos) {
      if (a.canceladoAt) continue
      for (const c of a.capturas) {
        if (c.capturadoAt || c.canceladoAt) continue
        map.set(c.user.id, { ...c, arqueo: a })
      }
    }
    return map
  }, [arqueos])

  const usuariosFiltrados = useMemo(() => {
    if (!branchId) return usuarios
    return usuarios.filter((u) => u.branch?.id === branchId)
  }, [usuarios, branchId])

  async function handleCancelar(arqueoId: string) {
    const razon = prompt('Razón de la cancelación:')
    if (!razon || razon.trim().length < 3) return
    setCancelando(arqueoId)
    try {
      const res = await fetch(`/api/arqueos/${arqueoId}/cancelar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ razon: razon.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Error al cancelar')
      toast({ title: 'Arqueo cancelado' })
      router.refresh()
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Error',
        variant: 'destructive',
      })
    } finally {
      setCancelando(null)
    }
  }

  /**
   * Libera a UN usuario de un arqueo pendiente (cancela su captura
   * individual sin tocar las demás del mismo arqueo). Útil cuando el
   * admin lanzó un global/branch pero quiere exceptuar a alguien a
   * mitad de camino.
   */
  async function handleLiberarCaptura(capturaId: string, userName: string) {
    const ok = confirm(`¿Liberar a ${userName} del arqueo? Podrá volver a usar el sistema sin capturar.`)
    if (!ok) return
    setLiberandoCaptura(capturaId)
    try {
      const res = await fetch(`/api/arqueos/capturas/${capturaId}/cancelar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ razon: `Liberado individualmente por el admin` }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Error al liberar')
      toast({ title: 'Usuario liberado', description: `${userName} ya no está bloqueado.` })
      router.refresh()
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Error',
        variant: 'destructive',
      })
    } finally {
      setLiberandoCaptura(null)
    }
  }

  const colorDiferencia = (diff: number) => {
    if (Math.abs(diff) < 0.01) return 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
    if (diff < 0) return 'text-red-400 border-red-500/40 bg-red-500/10'
    return 'text-amber-400 border-amber-500/40 bg-amber-500/10'
  }

  return (
    <div className="space-y-6">
      {/* ── KPIs ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Arqueos lanzados" value={kpi.total.toString()} />
        <KpiCard label="Cumplidos"        value={kpi.cumplidos.toString()}  tone="good"    />
        <KpiCard label="Pendientes"       value={kpi.pendientes.toString()} tone="warn"    />
        <KpiCard
          label="Diferencia neta"
          value={`${kpi.diferenciaTotal >= 0 ? '+' : ''}$${kpi.diferenciaTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`}
          tone={Math.abs(kpi.diferenciaTotal) < 0.01 ? 'good' : kpi.diferenciaTotal < 0 ? 'bad' : 'warn'}
        />
      </div>

      {/* ── Filtros + lanzadores globales ───────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Filter className="h-3.5 w-3.5" /> Rango:
        </div>
        {(['hoy', 'semana', 'todo'] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRango(r)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              rango === r
                ? 'bg-fuchsia-500/20 text-fuchsia-200 border border-fuchsia-500/40'
                : 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700'
            }`}
          >
            {r === 'hoy' ? 'Hoy' : r === 'semana' ? 'Semana MK' : 'Todo'}
          </button>
        ))}
        <select
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          className="ml-2 bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded-md px-2 py-1 focus:outline-none focus:border-fuchsia-500"
        >
          <option value="">Todas las sucursales</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
        </select>

        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowLanzar({ tipo: 'GLOBAL' })}
          >
            <Globe2 className="h-4 w-4" />
            Arqueo global
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowLanzar({ tipo: 'BRANCH' })}
          >
            <Building className="h-4 w-4" />
            Arqueo por sucursal
          </Button>
        </div>
      </div>

      {/* ── Lista de usuarios ───────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
          <Users className="h-4 w-4" />
          Usuarios ({usuariosFiltrados.length})
        </h2>
        <div className="space-y-2">
          {usuariosFiltrados.map((u) => {
            const capturas = capturasPorUser.get(u.id) ?? []
            // Captura pendiente para el indicador de presencia — se saca
            // del mapa SIN filtrar para que el badge sea fiel al estado
            // ahora mismo del user (quién está bloqueado), sin importar
            // el rango de fecha / sucursal que esté viendo el admin.
            const pendienteDeEsteUser = pendienteActualPorUser.get(u.id) ?? null
            const presencia = (() => {
              if (!pendienteDeEsteUser) return null
              if (!pendienteDeEsteUser.ultimoVistoAt) {
                return { tone: 'offline', label: 'No ha abierto' as const }
              }
              const diffMs = nowTick - new Date(pendienteDeEsteUser.ultimoVistoAt).getTime()
              if (diffMs < ONLINE_THRESHOLD_MS) {
                return { tone: 'online', label: 'En línea' as const }
              }
              const segs = Math.floor(diffMs / 1000)
              if (segs < 60) return { tone: 'away', label: `Visto hace ${segs}s` as const }
              const mins = Math.floor(segs / 60)
              if (mins < 60) return { tone: 'away', label: `Visto hace ${mins}m` as const }
              const horas = Math.floor(mins / 60)
              return { tone: 'away', label: `Visto hace ${horas}h` as const }
            })()
            return (
              <div key={u.id} className="rounded-lg border border-gray-200 bg-white p-3 flex items-start gap-3 flex-wrap">
                <div className="min-w-[220px]">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm text-gray-900">{u.nombre}</p>
                    {presencia && (
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
                          presencia.tone === 'online'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                            : presencia.tone === 'away'
                              ? 'bg-amber-50 text-amber-700 border-amber-300'
                              : 'bg-gray-100 text-gray-500 border-gray-300'
                        }`}
                        title={presencia.tone === 'online' ? 'Está viendo la pantalla de arqueo en este momento' : 'Última vez que abrió la pantalla'}
                      >
                        {presencia.tone === 'online'
                          ? <>
                              <span className="relative flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                              </span>
                              {presencia.label}
                            </>
                          : presencia.tone === 'away'
                            ? <><Wifi className="h-2.5 w-2.5" />{presencia.label}</>
                            : <><WifiOff className="h-2.5 w-2.5" />{presencia.label}</>
                        }
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    {ROL_LABELS[u.rol] ?? u.rol}
                    {u.branch?.nombre && <> · {u.branch.nombre}</>}
                  </p>
                </div>

                {/* Chips de capturas */}
                <div className="flex-1 flex flex-wrap gap-1.5 min-w-0">
                  {capturas.length === 0 && (
                    <span className="text-xs text-gray-400 italic">Sin arqueos en el rango</span>
                  )}
                  {capturas.map((c) => {
                    const cancelled = !!(c.canceladoAt || c.arqueo.canceladoAt)
                    const pending = !cancelled && !c.capturadoAt
                    const diffEf = (c.totalEfectivoDeclarado ?? 0) - (c.totalEfectivoEsperado ?? 0)
                    const diffTr = (c.totalTransferenciasDeclarado ?? 0) - (c.totalTransferenciasEsperado ?? 0)
                    const diffTotal = diffEf + diffTr
                    const chipClass = cancelled
                      ? 'bg-gray-100 text-gray-500 border-gray-300 line-through'
                      : pending
                        ? 'bg-amber-50 text-amber-700 border-amber-300'
                        : colorDiferencia(diffTotal)
                    // Chip de "Pendiente" lleva un botón X embebido para
                    // liberar al user de ese arqueo sin tocar los demás.
                    if (pending) {
                      return (
                        <span
                          key={c.id}
                          className={`text-xs px-1.5 py-1 rounded-md border flex items-center gap-1 ${chipClass}`}
                          title={new Date(c.arqueo.lanzadoAt).toLocaleString('es-MX')}
                        >
                          <button
                            type="button"
                            onClick={() => setDetalleCaptura(c)}
                            className="flex items-center gap-1 hover:opacity-80"
                          >
                            <Clock className="h-3 w-3" />
                            Pendiente
                          </button>
                          <button
                            type="button"
                            onClick={() => handleLiberarCaptura(c.id, u.nombre)}
                            disabled={liberandoCaptura === c.id}
                            title="Liberar a este usuario del arqueo"
                            className="ml-1 rounded hover:bg-amber-200/60 p-0.5 disabled:opacity-50"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      )
                    }
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setDetalleCaptura(c)}
                        className={`text-xs px-2 py-1 rounded-md border flex items-center gap-1.5 transition-opacity hover:opacity-80 ${chipClass}`}
                        title={new Date(c.arqueo.lanzadoAt).toLocaleString('es-MX')}
                      >
                        {cancelled ? <X className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                        {cancelled
                          ? 'Cancelado'
                          : `${diffTotal >= 0 ? '+' : ''}$${diffTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      </button>
                    )
                  })}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowLanzar({ tipo: 'INDIVIDUAL', targetUser: u })}
                >
                  Arqueo
                </Button>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Historial de arqueos (compacto, con cancelar) ───────────── */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Historial</h2>
        <div className="space-y-2">
          {arqueosFiltrados.length === 0 && (
            <p className="text-sm text-gray-500 italic">Sin arqueos en el rango seleccionado.</p>
          )}
          {arqueosFiltrados.map((a) => {
            const pendCount = a.capturas.filter((c) => !c.capturadoAt && !c.canceladoAt && !a.canceladoAt).length
            const totalCount = a.capturas.length
            return (
              <div key={a.id} className="rounded-lg border border-gray-200 bg-white p-3 flex items-center gap-3 text-sm flex-wrap">
                <div className="flex items-center gap-2">
                  {a.tipo === 'GLOBAL'    && <Globe2 className="h-4 w-4 text-fuchsia-500" />}
                  {a.tipo === 'BRANCH'    && <Building className="h-4 w-4 text-blue-500" />}
                  {a.tipo === 'INDIVIDUAL'&& <Users className="h-4 w-4 text-gray-500" />}
                  <span className="font-semibold">{a.tipo === 'GLOBAL' ? 'Global' : a.tipo === 'BRANCH' ? `Sucursal — ${a.branchNombre ?? '?'}` : 'Individual'}</span>
                </div>
                <span className="text-xs text-gray-500">
                  Lanzado por {a.lanzadoPor?.nombre ?? '—'} · {new Date(a.lanzadoAt).toLocaleString('es-MX')}
                </span>
                {a.canceladoAt ? (
                  <span className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-0.5">
                    Cancelado{a.canceladoRazon ? `: ${a.canceladoRazon}` : ''}
                  </span>
                ) : (
                  <span className={`text-xs px-2 py-0.5 rounded border ${pendCount > 0 ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200'}`}>
                    {pendCount > 0 ? `${pendCount} pendientes` : `${totalCount} cumplidos`}
                  </span>
                )}
                {!a.canceladoAt && pendCount > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto"
                    disabled={cancelando === a.id}
                    onClick={() => handleCancelar(a.id)}
                  >
                    Cancelar
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Dialogs */}
      {showLanzar && (
        <LanzarArqueoDialog
          tipo={showLanzar.tipo}
          targetUser={showLanzar.targetUser}
          branches={branches}
          onClose={() => setShowLanzar(null)}
          onLanzado={() => { setShowLanzar(null); router.refresh() }}
        />
      )}
      {detalleCaptura && (
        <ArqueoDetalleDialog captura={detalleCaptura} onClose={() => setDetalleCaptura(null)} />
      )}
    </div>
  )
}

function KpiCard({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warn' | 'bad' }) {
  const toneClass = tone === 'good' ? 'text-emerald-600' : tone === 'warn' ? 'text-amber-600' : tone === 'bad' ? 'text-red-600' : 'text-gray-800'
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${toneClass}`}>{value}</p>
    </div>
  )
}
