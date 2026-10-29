'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { Download, Image as ImageIcon, Loader2, Building2, User, Users, TrendingUp, Wallet, AlertCircle } from 'lucide-react'
import { formatMoney } from '@/lib/utils'
import type { ReporteEjecutivo, SucursalEjecutivo, CoordinadorEjecutivo } from '@/lib/reportes/ejecutivo'
import { toPng } from 'html-to-image'

const COLOR_STYLES: Record<CoordinadorEjecutivo['color'], { badge: string; row: string; label: string }> = {
  verde:    { badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', row: 'bg-emerald-500/5 border-l-4 border-l-emerald-500', label: 'Bueno' },
  amarillo: { badge: 'bg-amber-500/15 text-amber-300 border-amber-500/40',       row: 'bg-amber-500/5 border-l-4 border-l-amber-500',       label: 'Medio' },
  rojo:     { badge: 'bg-rose-500/15 text-rose-300 border-rose-500/40',          row: 'bg-rose-500/5 border-l-4 border-l-rose-500',         label: 'Bajo'  },
}

const ROL_LABEL: Record<string, string> = {
  COORDINADOR:   'Coord',
  COBRADOR:      'Cobradora',
  GERENTE:       'Gerente',
  GERENTE_ZONAL: 'GZ',
}

function pctColor(pct: number): string {
  if (pct >= 85) return 'text-emerald-400'
  if (pct >= 60) return 'text-amber-400'
  return 'text-rose-400'
}

export function ReporteEjecutivoView({ data, empresa }: { data: ReporteEjecutivo; empresa: string }) {
  const { toast } = useToast()
  const canvasRef = useRef<HTMLDivElement>(null)
  const [descargando, setDescargando] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggleExpand(cobradorId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(cobradorId)) next.delete(cobradorId)
      else next.add(cobradorId)
      return next
    })
  }

  async function descargarImagen() {
    if (!canvasRef.current) return
    setDescargando(true)
    try {
      // Forzamos expandir TODOS los pendientes para que la imagen tenga todo.
      const expandidosPrev = new Set(expanded)
      const todos = new Set<string>()
      for (const s of data.sucursales) for (const c of s.coordinadores) todos.add(c.cobradorId)
      setExpanded(todos)
      // Esperamos un frame para que el DOM se re-renderice
      await new Promise((r) => requestAnimationFrame(() => r(null)))
      await new Promise((r) => setTimeout(r, 100))

      const dataUrl = await toPng(canvasRef.current, {
        backgroundColor: '#0b0912',
        pixelRatio: 2,
        cacheBust: true,
      })

      const semanaTag = `${new Date(data.semanaInicio).toISOString().slice(0, 10)}_${new Date(data.semanaFin).toISOString().slice(0, 10)}`
      const link = document.createElement('a')
      link.download = `reporte-ejecutivo_${semanaTag}.png`
      link.href = dataUrl
      link.click()

      // Restaurar estado de expansión
      setExpanded(expandidosPrev)
      toast({ title: '✅ Imagen descargada' })
    } catch (e) {
      toast({ title: 'Error al generar la imagen', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
    } finally {
      setDescargando(false)
    }
  }

  // El page.tsx serializa con JSON — las fechas llegan como string ISO,
  // no como Date. Convertimos antes de formatear.
  const semanaInicioDate = new Date(data.semanaInicio)
  const semanaFinDate    = new Date(data.semanaFin)
  const semanaRange = `${semanaInicioDate.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })} – ${semanaFinDate.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}`

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reporte ejecutivo semanal</h1>
          <p className="text-muted-foreground text-sm">
            Avance de colocación y cobranza por sucursal · {semanaRange}
          </p>
        </div>
        <Button onClick={descargarImagen} disabled={descargando}>
          {descargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Descargar imagen
        </Button>
      </div>

      {/* Zona que se captura para la imagen */}
      <div ref={canvasRef} className="space-y-4 p-4 rounded-xl" style={{ backgroundColor: '#0b0912' }}>
        {/* Header dentro de la imagen */}
        <div className="flex items-center justify-between gap-4 pb-3 border-b border-border/50">
          <div>
            <p className="text-xs uppercase tracking-widest text-primary-300">{empresa}</p>
            <h2 className="text-xl font-semibold text-foreground">Reporte ejecutivo semanal</h2>
            <p className="text-xs text-muted-foreground">{semanaRange}</p>
          </div>
          <div className="text-xs text-right text-muted-foreground">
            <p>Generado: {new Date().toLocaleString('es-MX')}</p>
            <p className="flex items-center gap-1 justify-end mt-1">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" /> Bueno (≥85%)
              <span className="inline-block w-2 h-2 rounded-full bg-amber-500 ml-2" /> Medio (60-84%)
              <span className="inline-block w-2 h-2 rounded-full bg-rose-500 ml-2" /> Bajo (&lt;60%)
            </p>
          </div>
        </div>

        {data.sucursales.length === 0 && (
          <div className="text-center py-10 text-muted-foreground text-sm">
            No hay sucursales activas con datos esta semana.
          </div>
        )}

        {data.sucursales.map((suc) => (
          <SucursalCard
            key={suc.branchId}
            sucursal={suc}
            expanded={expanded}
            onToggle={toggleExpand}
          />
        ))}
      </div>
    </div>
  )
}

function SucursalCard({
  sucursal, expanded, onToggle,
}: {
  sucursal: SucursalEjecutivo
  expanded: Set<string>
  onToggle: (id: string) => void
}) {
  if (sucursal.coordinadores.length === 0) {
    return (
      <Card className="border-border/40 bg-background/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary-300" />
            {sucursal.nombre}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">Sin actividad esta semana.</p>
        </CardContent>
      </Card>
    )
  }
  return (
    <Card className="border-border/40 bg-background/40">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary-300" />
              {sucursal.nombre}
            </CardTitle>
            <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
              {sucursal.concentradoraNombre && (
                <p><strong className="text-foreground">Concentradora:</strong> {sucursal.concentradoraNombre}</p>
              )}
              {sucursal.gerenteZonalNombre && (
                <p><strong className="text-foreground">GZ:</strong> {sucursal.gerenteZonalNombre}</p>
              )}
              <p><strong className="text-foreground">Coordinadores:</strong> {sucursal.coordinadores.length}</p>
            </div>
          </div>
          {/* Totales de la sucursal */}
          <div className="grid grid-cols-2 gap-2 text-xs min-w-[280px]">
            <div className="rounded-md border border-border/50 bg-background/60 p-2">
              <p className="text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Colocación</p>
              <p className="font-semibold tabular-nums">{formatMoney(sucursal.colocacionTotal)}</p>
              <p className="text-muted-foreground text-[11px]">de {formatMoney(sucursal.metaColocacionTotal)}</p>
              <p className={`text-sm font-bold ${pctColor(sucursal.colocacionPct)}`}>{sucursal.metaColocacionTotal > 0 ? `${sucursal.colocacionPct}%` : '—'}</p>
            </div>
            <div className="rounded-md border border-border/50 bg-background/60 p-2">
              <p className="text-muted-foreground flex items-center gap-1"><Wallet className="h-3 w-3" /> Cobranza</p>
              <p className="font-semibold tabular-nums">{formatMoney(sucursal.recuperadoTotal)}</p>
              <p className="text-muted-foreground text-[11px]">de {formatMoney(sucursal.pactadoTotal)} pactado</p>
              <p className={`text-sm font-bold ${pctColor(sucursal.cobranzaPct)}`}>{sucursal.pactadoTotal > 0 ? `${sucursal.cobranzaPct}%` : '—'}</p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {sucursal.coordinadores.map((coord) => (
          <CoordinadorRow key={coord.cobradorId} coord={coord} expanded={expanded.has(coord.cobradorId)} onToggle={onToggle} />
        ))}
      </CardContent>
    </Card>
  )
}

function CoordinadorRow({
  coord, expanded, onToggle,
}: {
  coord: CoordinadorEjecutivo
  expanded: boolean
  onToggle: (id: string) => void
}) {
  const style = COLOR_STYLES[coord.color]
  return (
    <div className={`rounded-md p-3 ${style.row}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium truncate">{coord.nombre}</span>
            <span className="text-[11px] text-muted-foreground">{ROL_LABEL[coord.rol] ?? coord.rol}</span>
            <Badge className={`text-[11px] ${style.badge}`}>{style.label} · {coord.score}</Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 mt-2 text-xs">
            <div>
              <p className="text-muted-foreground">Meta coloc.</p>
              <p className="font-semibold tabular-nums">{formatMoney(coord.metaColocacion)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Coloc. real</p>
              <p className="font-semibold tabular-nums">{formatMoney(coord.colocacionReal)}</p>
              <p className={`font-bold ${pctColor(coord.colocacionPct)}`}>{coord.metaColocacion > 0 ? `${coord.colocacionPct}%` : '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Pactado</p>
              <p className="font-semibold tabular-nums">{formatMoney(coord.pactado)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Recuperado</p>
              <p className="font-semibold tabular-nums">{formatMoney(coord.recuperado)}</p>
              <p className={`font-bold ${pctColor(coord.cobranzaPct)}`}>{coord.pactado > 0 ? `${coord.cobranzaPct}%` : '—'}</p>
            </div>
          </div>
        </div>
        <div className="text-right text-xs min-w-[120px]">
          <p className="text-muted-foreground flex items-center justify-end gap-1"><AlertCircle className="h-3 w-3" /> Pendientes</p>
          <p className="font-bold text-rose-400 tabular-nums">{formatMoney(coord.pagosPendientesTotal)}</p>
          <p className="text-muted-foreground text-[11px]">{coord.pagosPendientes.length} pagos</p>
          {coord.pagosPendientes.length > 0 && (
            <button
              type="button"
              onClick={() => onToggle(coord.cobradorId)}
              className="text-primary-400 hover:underline text-[11px] mt-1"
            >
              {expanded ? 'Ocultar detalle' : 'Ver detalle'}
            </button>
          )}
        </div>
      </div>

      {/* Detalle de pagos pendientes */}
      {expanded && coord.pagosPendientes.length > 0 && (
        <div className="mt-3 rounded-md border border-border/50 bg-background/60 p-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
            <Users className="h-3 w-3" /> Pagos aún pendientes de recuperar esta semana
          </p>
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-2 py-1">Cliente</th>
                <th className="text-left px-2 py-1">Pago</th>
                <th className="text-left px-2 py-1">Vence</th>
                <th className="text-right px-2 py-1">Esperado</th>
                <th className="text-right px-2 py-1">Pagado</th>
                <th className="text-right px-2 py-1">Pendiente</th>
              </tr>
            </thead>
            <tbody>
              {coord.pagosPendientes.map((p) => (
                <tr key={p.scheduleId} className="border-t border-border/30">
                  <td className="px-2 py-1 truncate">{p.clienteNombre}</td>
                  <td className="px-2 py-1">#{p.numeroPago}</td>
                  <td className="px-2 py-1">{new Date(p.fechaVencimiento).toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit' })}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{formatMoney(p.montoEsperado)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{formatMoney(p.montoPagado)}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-rose-300 font-medium">{formatMoney(p.pendiente)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
