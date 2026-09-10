'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatMoney, formatDate } from '@/lib/utils'
import {
  Building2, UserCheck, Ticket as TicketIcon, RotateCcw, Ban, Eye,
  Search, Filter, X,
} from 'lucide-react'

/**
 * Vista de tickets para DG / DC / SUPER_ADMIN / MESA_CONTROL. Agrupa
 * por sucursal → empleado como antes, pero encima suma un panel con:
 *   - Búsqueda libre (# de ticket + cliente + empleado)
 *   - Filtro por sucursal, empleado, estado y método de pago
 *   - Rango de fechas y orden
 *
 * Los conteos de las tarjetas superiores respetan los filtros — para
 * que "Anulados" no diga 12 cuando la busqueda deja 2 visibles.
 */

export interface AdminTicketRow {
  id: string
  numeroTicket: string
  esReimpresion: boolean
  anulado: boolean
  impresoAt: string        // ISO
  impresoPorId: string
  branchId: string
  branchNombre: string
  empleadoNombre: string
  empleadoRol: string
  clienteNombre: string
  monto: number
  metodoPago: string       // CASH / CARD / TRANSFER
}

interface Props {
  tickets: AdminTicketRow[]
}

const ROL_LABEL: Record<string, string> = {
  DIRECTOR_GENERAL:   'Director General',
  DIRECTOR_COMERCIAL: 'Director Comercial',
  GERENTE_ZONAL:      'Gerente Zonal',
  GERENTE:            'Gerente',
  COORDINADOR:        'Coordinador',
  COBRADOR:           'Cobrador',
  SUPER_ADMIN:        'Super Administrador',
  MESA_CONTROL:       'Mesa de Control',
}

const METODO_LABEL: Record<string, string> = {
  CASH:     'Efectivo',
  CARD:     'Tarjeta',
  TRANSFER: 'Transferencia',
}

type EstadoFilter = '__ALL__' | 'ORIGINAL' | 'REIMPRESION' | 'ANULADO'
type Orden = 'fecha-desc' | 'fecha-asc' | 'monto-desc' | 'monto-asc'

export function TicketsAdminView({ tickets }: Props) {
  const [q, setQ] = useState('')
  const [branchFilter, setBranchFilter]     = useState<string>('__ALL__')
  const [empleadoFilter, setEmpleadoFilter] = useState<string>('__ALL__')
  const [estadoFilter, setEstadoFilter]     = useState<EstadoFilter>('__ALL__')
  const [metodoFilter, setMetodoFilter]     = useState<string>('__ALL__')
  const [fechaDesde, setFechaDesde]         = useState('')
  const [fechaHasta, setFechaHasta]         = useState('')
  const [orden, setOrden]                   = useState<Orden>('fecha-desc')

  const sucursales = useMemo(() => {
    const set = new Set<string>()
    for (const t of tickets) set.add(t.branchNombre)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [tickets])

  // Empleados se filtran por sucursal actualmente seleccionada para no
  // ofrecer nombres que no aplican al filtro.
  const empleados = useMemo(() => {
    const set = new Set<string>()
    for (const t of tickets) {
      if (branchFilter === '__ALL__' || t.branchNombre === branchFilter) {
        set.add(t.empleadoNombre)
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [tickets, branchFilter])

  const filtroActivo = q.trim() !== ''
    || branchFilter !== '__ALL__'
    || empleadoFilter !== '__ALL__'
    || estadoFilter !== '__ALL__'
    || metodoFilter !== '__ALL__'
    || fechaDesde !== ''
    || fechaHasta !== ''

  function resetFiltros() {
    setQ('')
    setBranchFilter('__ALL__')
    setEmpleadoFilter('__ALL__')
    setEstadoFilter('__ALL__')
    setMetodoFilter('__ALL__')
    setFechaDesde('')
    setFechaHasta('')
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const desde = fechaDesde ? new Date(fechaDesde + 'T00:00:00') : null
    const hasta = fechaHasta ? new Date(fechaHasta + 'T23:59:59') : null
    const arr = tickets.filter((t) => {
      if (branchFilter   !== '__ALL__' && t.branchNombre   !== branchFilter)   return false
      if (empleadoFilter !== '__ALL__' && t.empleadoNombre !== empleadoFilter) return false
      if (metodoFilter   !== '__ALL__' && t.metodoPago     !== metodoFilter)   return false
      if (estadoFilter !== '__ALL__') {
        if (estadoFilter === 'ANULADO'     && !t.anulado)                     return false
        if (estadoFilter === 'REIMPRESION' && (!t.esReimpresion || t.anulado)) return false
        if (estadoFilter === 'ORIGINAL'    && (t.esReimpresion || t.anulado))  return false
      }
      if (desde || hasta) {
        const d = new Date(t.impresoAt)
        if (desde && d < desde) return false
        if (hasta && d > hasta) return false
      }
      if (needle) {
        const hay = `${t.numeroTicket} ${t.clienteNombre} ${t.empleadoNombre}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
    arr.sort((a, b) => {
      switch (orden) {
        case 'fecha-asc':  return new Date(a.impresoAt).getTime() - new Date(b.impresoAt).getTime()
        case 'monto-desc': return b.monto - a.monto
        case 'monto-asc':  return a.monto - b.monto
        case 'fecha-desc':
        default:           return new Date(b.impresoAt).getTime() - new Date(a.impresoAt).getTime()
      }
    })
    return arr
  }, [tickets, q, branchFilter, empleadoFilter, estadoFilter, metodoFilter, fechaDesde, fechaHasta, orden])

  // Métricas de los filtrados
  const totalTickets       = filtered.length
  const totalReimpresiones = filtered.filter((t) => t.esReimpresion && !t.anulado).length
  const totalAnulados      = filtered.filter((t) => t.anulado).length
  const totalOriginales    = filtered.filter((t) => !t.esReimpresion && !t.anulado).length

  // Agrupar los filtrados: sucursal → empleado → tickets. Cuando hay
  // orden activo el orden se preserva porque los filtrados ya vienen
  // ordenados y `for...of` sobre un array mantiene la secuencia.
  const branchMap = useMemo(() => {
    const map: Record<string, {
      branchNombre: string
      empleados: Record<string, {
        empleadoNombre: string
        empleadoRol: string
        tickets: AdminTicketRow[]
      }>
    }> = {}
    for (const t of filtered) {
      if (!map[t.branchId]) map[t.branchId] = { branchNombre: t.branchNombre, empleados: {} }
      if (!map[t.branchId].empleados[t.impresoPorId]) {
        map[t.branchId].empleados[t.impresoPorId] = {
          empleadoNombre: t.empleadoNombre,
          empleadoRol:    t.empleadoRol,
          tickets:        [],
        }
      }
      map[t.branchId].empleados[t.impresoPorId].tickets.push(t)
    }
    return map
  }, [filtered])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Historial de tickets</h1>
        <p className="text-muted-foreground text-sm">
          Registro global de impresiones y reimpresiones — últimos 500
        </p>
      </div>

      {/* ── FILTROS ────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filtros</span>
            <span className="text-xs text-muted-foreground">
              {totalTickets} ticket{totalTickets !== 1 ? 's' : ''}
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
            <div className="space-y-1 lg:col-span-2">
              <Label className="text-xs">Buscar # de ticket / cliente / empleado</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sucursal</Label>
              <select
                value={branchFilter}
                onChange={(e) => { setBranchFilter(e.target.value); setEmpleadoFilter('__ALL__') }}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="__ALL__">Todas</option>
                {sucursales.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Empleado</Label>
              <select
                value={empleadoFilter}
                onChange={(e) => setEmpleadoFilter(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="__ALL__">Todos</option>
                {empleados.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Estado</Label>
              <select
                value={estadoFilter}
                onChange={(e) => setEstadoFilter(e.target.value as EstadoFilter)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="__ALL__">Todos</option>
                <option value="ORIGINAL">Originales</option>
                <option value="REIMPRESION">Reimpresiones</option>
                <option value="ANULADO">Anulados</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Método de pago</Label>
              <select
                value={metodoFilter}
                onChange={(e) => setMetodoFilter(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="__ALL__">Todos</option>
                <option value="CASH">Efectivo</option>
                <option value="CARD">Tarjeta</option>
                <option value="TRANSFER">Transferencia</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Desde</Label>
              <Input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hasta</Label>
              <Input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ordenar por</Label>
              <select
                value={orden}
                onChange={(e) => setOrden(e.target.value as Orden)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="fecha-desc">Más reciente</option>
                <option value="fecha-asc">Más antiguo</option>
                <option value="monto-desc">Monto (mayor a menor)</option>
                <option value="monto-asc">Monto (menor a mayor)</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Métricas — respetan los filtros */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total tickets</p>
            <p className="text-2xl font-bold">{totalTickets}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <TicketIcon className="h-3 w-3" /> Originales
            </p>
            <p className="text-2xl font-bold text-emerald-400">{totalOriginales}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <RotateCcw className="h-3 w-3" /> Reimpresiones
            </p>
            <p className="text-2xl font-bold text-amber-400">{totalReimpresiones}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Ban className="h-3 w-3" /> Anulados
            </p>
            <p className="text-2xl font-bold text-red-400">{totalAnulados}</p>
          </CardContent>
        </Card>
      </div>

      {Object.keys(branchMap).length === 0 && (
        <div className="text-center py-12">
          <TicketIcon className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">
            {filtroActivo ? 'No hay tickets con estos filtros' : 'No hay tickets registrados aún'}
          </p>
        </div>
      )}

      {/* Agrupación por sucursal */}
      {Object.entries(branchMap).map(([bId, branch]) => {
        const branchTotal = Object.values(branch.empleados).reduce((s, e) => s + e.tickets.length, 0)

        return (
          <div key={bId} className="space-y-3">
            <div className="flex items-center gap-2 pt-2">
              <Building2 className="h-4 w-4 text-primary-400" />
              <h2 className="font-semibold text-lg">{branch.branchNombre}</h2>
              <span className="text-xs text-muted-foreground">· {branchTotal} tickets</span>
            </div>

            {Object.entries(branch.empleados).map(([eId, emp]) => {
              const empReimpresiones = emp.tickets.filter((t) => t.esReimpresion && !t.anulado).length
              const empAnulados      = emp.tickets.filter((t) => t.anulado).length

              return (
                <Card key={eId}>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <UserCheck className="h-4 w-4 text-primary-400" />
                        <span>{emp.empleadoNombre}</span>
                        <span className="text-xs text-muted-foreground font-normal">
                          ({ROL_LABEL[emp.empleadoRol] ?? emp.empleadoRol})
                        </span>
                      </div>
                      <div className="text-xs font-normal flex items-center gap-3">
                        <span>{emp.tickets.length} tickets</span>
                        {empReimpresiones > 0 && (
                          <span className="text-amber-400">{empReimpresiones} reimpr.</span>
                        )}
                        {empAnulados > 0 && (
                          <span className="text-red-400">{empAnulados} anulados</span>
                        )}
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="space-y-1.5">
                      {emp.tickets.map((t) => (
                        <Link
                          key={t.id}
                          href={`/verificar/${encodeURIComponent(t.numeroTicket)}`}
                          target="_blank"
                          className={`flex items-center gap-3 py-2 px-3 rounded-lg text-sm border transition-colors ${
                            t.anulado
                              ? 'bg-red-500/5 border-red-500/20 opacity-60'
                              : t.esReimpresion
                              ? 'bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40'
                              : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs font-semibold">{t.numeroTicket}</span>
                              {t.esReimpresion && <Badge variant="warning" className="text-[10px] px-1.5 py-0">Reimpr.</Badge>}
                              {t.anulado && <Badge variant="error" className="text-[10px] px-1.5 py-0">Anulado</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {t.clienteNombre} · {METODO_LABEL[t.metodoPago] ?? t.metodoPago} · {formatDate(t.impresoAt, "dd/MM/yyyy HH:mm")}
                            </p>
                          </div>
                          <div className="text-right shrink-0 flex items-center gap-2">
                            <span className="font-semibold text-sm">{formatMoney(t.monto)}</span>
                            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
