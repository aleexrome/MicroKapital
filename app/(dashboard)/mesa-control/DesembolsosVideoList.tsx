'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatMoney } from '@/lib/utils'
import {
  Video, CheckCircle, XCircle, MapPin, Building2, User, Search, Filter, X,
  RefreshCw, Clock, ChevronDown, ChevronUp, ExternalLink,
} from 'lucide-react'

/**
 * Fila de desembolso por video para la vista de auditoria en
 * /mesa-control. El server pasa los datos ya serializados (Decimal →
 * string, Date → ISO).
 */
export interface DesembolsoVideoRow {
  loanId:           string
  clienteNombre:    string
  clienteId:        string
  tipo:             string
  capital:          string   // Decimal serializado
  branchNombre:     string
  cobradorNombre:   string
  cobradorId:       string
  estadoLoan:       string   // ACTIVE, IN_ACTIVATION, etc.
  aprobado:         boolean | null   // true=paso, false=fallo, null=sin subir aun
  intentos:         number
  videoUrl:         string | null
  videoAt:          string | null    // ISO
  lat:              number | null
  lng:              number | null
  transcripcion:    string | null
  // JSON del reporte de validacion — se lee con acceso lazy segun
  // hace falta. Simplifica el type solo a lo que la UI usa.
  checks:           {
    nombre:        { ok: boolean; detalle: string } | null
    fecha:         { ok: boolean; detalle: string } | null
    monto:         { ok: boolean; detalle: string } | null
    palabraDelDia: { ok: boolean; detalle: string } | null
    dineroVisible: { ok: boolean; detalle: string } | null
  } | null
}

type EstadoFiltro = 'TODOS' | 'APROBADOS' | 'RECHAZADOS' | 'MULTI_INTENTOS'

interface Props {
  rows: DesembolsoVideoRow[]
}

export function DesembolsosVideoList({ rows }: Props) {
  const [q, setQ] = useState('')
  const [branchFilter, setBranchFilter] = useState<string>('__ALL__')
  const [cobradorFilter, setCobradorFilter] = useState<string>('__ALL__')
  const [estadoFilter, setEstadoFilter] = useState<EstadoFiltro>('TODOS')
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())

  const sucursales = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) set.add(r.branchNombre)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rows])
  const cobradores = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) set.add(r.cobradorNombre)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rows])

  const filtroActivo = q.trim() !== ''
    || branchFilter !== '__ALL__'
    || cobradorFilter !== '__ALL__'
    || estadoFilter !== 'TODOS'
  function resetFiltros() {
    setQ('')
    setBranchFilter('__ALL__')
    setCobradorFilter('__ALL__')
    setEstadoFilter('TODOS')
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (branchFilter !== '__ALL__' && r.branchNombre !== branchFilter) return false
      if (cobradorFilter !== '__ALL__' && r.cobradorNombre !== cobradorFilter) return false
      if (estadoFilter === 'APROBADOS'      && r.aprobado !== true)  return false
      if (estadoFilter === 'RECHAZADOS'     && r.aprobado !== false) return false
      if (estadoFilter === 'MULTI_INTENTOS' && r.intentos < 3)       return false
      if (needle) {
        const hay = `${r.clienteNombre} ${r.cobradorNombre} ${r.branchNombre}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [rows, q, branchFilter, cobradorFilter, estadoFilter])

  const conteoAprobados     = rows.filter((r) => r.aprobado === true).length
  const conteoRechazados    = rows.filter((r) => r.aprobado === false).length
  const conteoMultiIntentos = rows.filter((r) => r.intentos >= 3).length

  function toggle(id: string) {
    setExpandidos((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-4">
      {/* KPIs simples arriba */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-xl font-bold">{rows.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <CheckCircle className="h-3 w-3 text-emerald-500" /> Aprobados
            </p>
            <p className="text-xl font-bold text-emerald-500">{conteoAprobados}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <XCircle className="h-3 w-3 text-red-500" /> Rechazados
            </p>
            <p className="text-xl font-bold text-red-500">{conteoRechazados}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <RefreshCw className="h-3 w-3 text-amber-500" /> ≥3 intentos
            </p>
            <p className="text-xl font-bold text-amber-500">{conteoMultiIntentos}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filtros</span>
            <span className="text-xs text-muted-foreground">
              {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
            </span>
            {filtroActivo && (
              <button
                type="button"
                onClick={resetFiltros}
                className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <X className="h-3 w-3" /> Limpiar
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1 lg:col-span-2">
              <Label className="text-xs">Buscar cliente / coordinador / sucursal</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
              </div>
            </div>
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
            <div className="space-y-1">
              <Label className="text-xs">Coordinador</Label>
              <select
                value={cobradorFilter}
                onChange={(e) => setCobradorFilter(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="__ALL__">Todos</option>
                {cobradores.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Estado</Label>
              <select
                value={estadoFilter}
                onChange={(e) => setEstadoFilter(e.target.value as EstadoFiltro)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="TODOS">Todos</option>
                <option value="APROBADOS">Solo aprobados</option>
                <option value="RECHAZADOS">Solo rechazados</option>
                <option value="MULTI_INTENTOS">≥3 intentos (potencial fraude)</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="text-center py-10 text-muted-foreground">
            <Video className="h-10 w-10 mx-auto mb-2 opacity-50" />
            {rows.length === 0
              ? 'No hay desembolsos con video registrados aún.'
              : 'Sin resultados con los filtros actuales.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const isExpanded = expandidos.has(r.loanId)
            return (
              <Card key={r.loanId} className={
                r.aprobado === false
                  ? 'border-red-500/30 bg-red-500/5'
                  : r.intentos >= 3
                  ? 'border-amber-500/30 bg-amber-500/5'
                  : ''
              }>
                <CardContent className="p-4 space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/prestamos/${r.loanId}`}
                          className="font-semibold hover:underline"
                        >
                          {r.clienteNombre}
                        </Link>
                        <Badge variant="outline" className="text-[10px]">{r.tipo}</Badge>
                        <span className="font-semibold text-sm money">{formatMoney(Number(r.capital))}</span>
                        {r.aprobado === true && (
                          <Badge variant="success" className="text-[10px]">
                            <CheckCircle className="h-3 w-3 mr-1" /> Aprobado auto
                          </Badge>
                        )}
                        {r.aprobado === false && (
                          <Badge variant="error" className="text-[10px]">
                            <XCircle className="h-3 w-3 mr-1" /> Último intento rechazado
                          </Badge>
                        )}
                        {r.intentos >= 3 && (
                          <Badge variant="warning" className="text-[10px]">
                            {r.intentos} intentos
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" /> {r.branchNombre}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" /> {r.cobradorNombre}
                        </span>
                        {r.videoAt && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {new Date(r.videoAt).toLocaleString('es-MX')}
                          </span>
                        )}
                        {r.lat !== null && r.lng !== null && (
                          <a
                            href={`https://www.google.com/maps?q=${r.lat},${r.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 hover:underline text-primary-600"
                          >
                            <MapPin className="h-3 w-3" /> GPS
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/prestamos/${r.loanId}`}>
                          <ExternalLink className="h-3 w-3 mr-1" /> Ver préstamo
                        </Link>
                      </Button>
                      {(r.videoUrl || r.transcripcion || r.checks) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggle(r.loanId)}
                        >
                          {isExpanded
                            ? <><ChevronUp className="h-4 w-4 mr-1" /> Ocultar</>
                            : <><ChevronDown className="h-4 w-4 mr-1" /> Detalle</>}
                        </Button>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="space-y-3 pt-2 border-t">
                      {r.videoUrl && (
                        <video
                          src={r.videoUrl}
                          controls
                          playsInline
                          className="w-full max-h-72 rounded-lg bg-black"
                        />
                      )}

                      {r.checks && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {Object.entries(r.checks).map(([nombre, check]) => {
                            if (!check) return null
                            return (
                              <div
                                key={nombre}
                                className={`text-xs p-2 rounded border ${
                                  check.ok
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                    : 'bg-red-50 border-red-200 text-red-900'
                                }`}
                              >
                                <div className="flex items-center gap-1.5">
                                  {check.ok
                                    ? <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                                    : <XCircle className="h-3.5 w-3.5 shrink-0" />}
                                  <span className="font-semibold capitalize">{nombre}</span>
                                </div>
                                <p className="mt-1 text-[11px]">{check.detalle}</p>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {r.transcripcion && (
                        <div className="text-xs">
                          <p className="font-semibold text-muted-foreground uppercase tracking-widest mb-1">
                            Transcripción
                          </p>
                          <p className="bg-muted rounded p-2 whitespace-pre-wrap font-mono text-[11px]">
                            {r.transcripcion}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
