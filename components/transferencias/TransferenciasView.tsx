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
import { CheckCircle, Loader2, Building2, Clock, ShieldCheck, Search, Filter, X } from 'lucide-react'
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
  verificadoPor: { nombre: string } | null
  client: { nombreCompleto: string }
  loan: { tipo: string }
  /** Este viewer puede verificar ESTA fila específica (respeta la flag
   *  verificacionCentralizada de la sucursal del préstamo). */
  puedeVerificar: boolean
  sucursalNombre: string
}

interface Props {
  rows: TransferRow[]
  puedeVerificar: boolean
  rol: UserRole
}

export function TransferenciasView({ rows, puedeVerificar, rol }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [processing, setProcessing] = useState<string | null>(null)

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
  const [estadoFilter, setEstadoFilter] = useState<'__ALL__' | 'PENDIENTE' | 'VERIFICADO'>('__ALL__')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [orden, setOrden] = useState<'fecha-desc' | 'fecha-asc' | 'monto-desc' | 'monto-asc'>('fecha-desc')

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
    || estadoFilter !== '__ALL__'
    || fechaDesde !== ''
    || fechaHasta !== ''
  function resetFiltros() {
    setQ('')
    setBranchFilter('__ALL__')
    setCobradorFilter('__ALL__')
    setEstadoFilter('__ALL__')
    setFechaDesde('')
    setFechaHasta('')
  }

  // Un solo pipeline: filtrar + ordenar; luego se parte en pendientes /
  // verificadas. Así los dos badges de conteo respetan el filtro.
  const filtradasOrdenadas = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const desde = fechaDesde ? new Date(fechaDesde + 'T00:00:00') : null
    const hasta = fechaHasta ? new Date(fechaHasta + 'T23:59:59') : null
    const filtered = rows.filter((r) => {
      if (!enScope(r)) return false
      if (branchFilter !== '__ALL__' && r.sucursalNombre !== branchFilter) return false
      if (cobradorFilter !== '__ALL__' && r.cobrador.nombre !== cobradorFilter) return false
      if (estadoFilter !== '__ALL__' && r.statusTransferencia !== estadoFilter) return false
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
  }, [rows, q, branchFilter, cobradorFilter, estadoFilter, fechaDesde, fechaHasta, orden, esAdmin])

  const pendientes = filtradasOrdenadas.filter((r) => r.statusTransferencia === 'PENDIENTE')
  const verificadas = filtradasOrdenadas.filter((r) => r.statusTransferencia === 'VERIFICADO')

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
        <Card>
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
              {/* Estado */}
              <div className="space-y-1">
                <Label className="text-xs">Estado</Label>
                <select
                  value={estadoFilter}
                  onChange={(e) => setEstadoFilter(e.target.value as typeof estadoFilter)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="__ALL__">Todos</option>
                  <option value="PENDIENTE">Pendientes</option>
                  <option value="VERIFICADO">Verificadas</option>
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

      {/* ── PENDIENTES ─────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-yellow-500" />
          <h2 className="text-sm font-semibold">
            Pendientes de verificación <span className="text-muted-foreground">({pendientes.length})</span>
          </h2>
        </div>

        {pendientes.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No hay transferencias pendientes de verificación</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {pendientes.map((p) => (
              <Card key={p.id} className="border-yellow-500/20 bg-yellow-500/5">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="h-4 w-4 text-yellow-500" />
                        <Badge variant="secondary">Pendiente</Badge>
                        <span className="font-semibold text-sm">{p.client.nombreCompleto}</span>
                      </div>
                      <div className="text-sm text-gray-700 space-y-0.5">
                        <p><span className="text-muted-foreground">Monto:</span> <span className="font-semibold money">{formatMoney(Number(p.monto))}</span></p>
                        <p><span className="text-muted-foreground">Cobrador:</span> {p.cobrador.nombre}</p>
                        <p><span className="text-muted-foreground">Capturado:</span> {formatDateTime(p.fechaHora)}</p>
                        {p.idTransferencia && (
                          <p><span className="text-muted-foreground">Referencia:</span> <span className="font-mono">{p.idTransferencia}</span></p>
                        )}
                        {p.cuentaDestino && (
                          <p className="flex items-center gap-1">
                            <Building2 className="h-3 w-3 text-muted-foreground" />
                            {p.cuentaDestino.banco} — CLABE: {p.cuentaDestino.clabe}
                          </p>
                        )}
                        <p><span className="text-muted-foreground">Sucursal:</span> {p.sucursalNombre}</p>
                      </div>
                    </div>
                    {p.puedeVerificar ? (
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
                    ) : puedeVerificar ? (
                      // El usuario puede verificar en general, pero no ESTA
                      // (sucursal centralizada fuera de su alcance).
                      <span className="text-xs italic text-muted-foreground shrink-0">
                        Verifica Dirección / Mesa de Control
                      </span>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ── VERIFICADAS ────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          <h2 className="text-sm font-semibold">
            Verificadas <span className="text-muted-foreground">({verificadas.length})</span>
          </h2>
        </div>

        {verificadas.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <p className="text-sm text-muted-foreground">Aún no hay transferencias verificadas</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {verificadas.map((p) => (
              <Card key={p.id}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <ShieldCheck className="h-4 w-4 text-emerald-500" />
                        <Badge variant="success">Verificada</Badge>
                        <span className="font-semibold text-sm">{p.client.nombreCompleto}</span>
                      </div>
                      <div className="text-sm text-gray-700 space-y-0.5">
                        <p><span className="text-muted-foreground">Monto:</span> <span className="font-semibold money">{formatMoney(Number(p.monto))}</span></p>
                        <p><span className="text-muted-foreground">Cobrador:</span> {p.cobrador.nombre}</p>
                        <p><span className="text-muted-foreground">Capturado:</span> {formatDateTime(p.fechaHora)}</p>
                        {p.idTransferencia && (
                          <p><span className="text-muted-foreground">Referencia:</span> <span className="font-mono">{p.idTransferencia}</span></p>
                        )}
                        {p.cuentaDestino && (
                          <p className="flex items-center gap-1">
                            <Building2 className="h-3 w-3 text-muted-foreground" />
                            {p.cuentaDestino.banco} — CLABE: {p.cuentaDestino.clabe}
                          </p>
                        )}
                        <p className="pt-1 mt-1 border-t border-border text-emerald-600">
                          <span className="text-muted-foreground">Validada por:</span>{' '}
                          <span className="font-medium">{p.verificadoPor?.nombre ?? '—'}</span>
                          {p.verificadoAt && (
                            <> · {formatDateTime(p.verificadoAt)}</>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
