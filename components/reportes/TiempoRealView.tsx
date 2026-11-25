'use client'

import { Fragment, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatMoney } from '@/lib/utils'
import { TrendingDown, Activity, Zap, Clock, Target, RefreshCw, Wallet, TrendingUp, Percent, DollarSign, Sparkles, Calendar } from 'lucide-react'
import {
  ResponsiveContainer, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Area, AreaChart, BarChart, Bar, Cell,
} from 'recharts'
import type { ReporteTiempoRealCobranza } from '@/lib/reportes/tiempoReal'

const REFRESH_MS = 2 * 60 * 1000

function formatHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-MX', {
    timeZone: 'America/Mexico_City',
    hour:   '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatVariacion(delta: number) {
  if (delta === 0) return '—'
  const sign = delta < 0 ? '−' : '+'
  return `${sign}${formatMoney(Math.abs(delta))}`
}

export function TiempoRealView({ initialData }: { initialData: ReporteTiempoRealCobranza }) {
  const [data, setData] = useState(initialData)
  const [refreshing, setRefreshing] = useState(false)
  const [ultimoFetch, setUltimoFetch] = useState<Date>(new Date())

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        setRefreshing(true)
        const res = await fetch('/api/reportes/tiempo-real/cobranza', { cache: 'no-store' })
        if (res.ok) {
          const nuevo = (await res.json()) as ReporteTiempoRealCobranza
          setData(nuevo)
          setUltimoFetch(new Date())
        }
      } catch { /* retry en el siguiente tick */ }
      finally { setRefreshing(false) }
    }, REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  const chartData = data.snapshots.map((s, i) => {
    const prev = i > 0 ? data.snapshots[i - 1].moraPendienteSemana : s.moraPendienteSemana
    return {
      hora:      formatHora(s.capturadoEn),
      mora:      s.moraPendienteSemana,
      variacion: s.moraPendienteSemana - prev,
    }
  })
  const ultimo = data.snapshots[data.snapshots.length - 1]
  const avancePct = ultimo && ultimo.pactadoSemana > 0
    ? Math.round((ultimo.cobradoSemana / ultimo.pactadoSemana) * 100)
    : 0

  const semanaChartData = data.diasSemana.map((d) => ({
    dia:  d.nombreCorto,
    mora: d.esFuturo ? null : d.moraPendienteAlCierre,
    cobrado: d.esFuturo ? null : d.cobradoAlCierre,
    pactado: d.esFuturo ? null : d.pactadoAlCierre,
    esHoy: d.esHoy,
    esFuturo: d.esFuturo,
  }))

  const tonoColor = data.interpretacion?.tono === 'positivo' ? 'text-emerald-400'
                  : data.interpretacion?.tono === 'neutro'   ? 'text-amber-400'
                  : 'text-rose-400'
  const tonoBg = data.interpretacion?.tono === 'positivo' ? 'from-emerald-950/40'
               : data.interpretacion?.tono === 'neutro'   ? 'from-amber-950/40'
               : 'from-rose-950/40'

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary-300" />
            Cobranza en tiempo real
          </h1>
          <p className="text-muted-foreground text-sm">
            {data.empresa} · snapshots horarios de la semana en curso · se refresca solo cada 2 minutos.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {refreshing && <RefreshCw className="h-3 w-3 animate-spin" />}
          Última actualización: {ultimoFetch.toLocaleTimeString('es-MX', { hour12: false })}
        </div>
      </div>

      {data.snapshots.length === 0 && (
        <Card className="border-border/40">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Aún no hay snapshots registrados hoy. Vuelve a cargar esta página entre 8:00 y 20:00 CDMX
            y se generará el primer corte automáticamente.
          </CardContent>
        </Card>
      )}

      {/* Narrativa de Claude Haiku (lectura ejecutiva), prominente arriba */}
      {data.narrativaIa && (
        <Card className="border-primary-500/40 bg-gradient-to-br from-primary-950/30 to-background">
          <CardContent className="py-5">
            <p className="text-[11px] uppercase tracking-wider text-primary-300 font-semibold flex items-center gap-1 mb-2">
              <Sparkles className="h-3 w-3" /> Lectura ejecutiva · generada por IA
            </p>
            <p className="text-base leading-relaxed">{data.narrativaIa}</p>
          </CardContent>
        </Card>
      )}

      {/* Resumen por reglas (fallback si no hay narrativa IA) */}
      {!data.narrativaIa && data.interpretacion && (
        <Card className={`border-border/40 bg-gradient-to-br ${tonoBg} to-background`}>
          <CardContent className="py-5">
            <p className={`text-base font-medium ${tonoColor}`}>{data.interpretacion.resumen}</p>
          </CardContent>
        </Card>
      )}

      {/* Hero: mora + estado actual */}
      {ultimo && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 border-primary-500/40 bg-gradient-to-br from-primary-950/40 to-background">
            <CardHeader className="pb-2">
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-primary-300" />
                  Mora pendiente de la semana
                </CardTitle>
                <span className="text-[11px] text-muted-foreground">corte {formatHora(ultimo.capturadoEn)}</span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-3 flex-wrap">
                <p className="text-4xl font-bold tabular-nums">{formatMoney(ultimo.moraPendienteSemana)}</p>
                {data.indicadores && (
                  <Badge className={`${data.indicadores.ultimoDeltaMonto > 0 ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' : 'bg-rose-500/15 text-rose-300 border-rose-500/40'}`}>
                    {data.indicadores.ultimoDeltaMonto > 0 ? '▼' : '▲'} {Math.abs(data.indicadores.ultimoDeltaPct)}% último corte
                  </Badge>
                )}
              </div>
              <p className="text-[12px] text-muted-foreground mt-1">
                Es el pactado que ya venció esta semana y aún no entra — baja conforme los coords cobran durante el día.
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Estado de la semana</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <KpiRow icon={<Wallet className="h-3 w-3" />} label="Cobrado" value={formatMoney(ultimo.cobradoSemana)} />
              <KpiRow icon={<Target className="h-3 w-3" />} label="Pactado" value={formatMoney(ultimo.pactadoSemana)} />
              <KpiRow icon={<Percent className="h-3 w-3" />} label="Avance" value={`${avancePct}%`} valueClass={avancePct >= 85 ? 'text-emerald-400' : avancePct >= 60 ? 'text-amber-400' : 'text-rose-400'} />
              <KpiRow icon={<TrendingUp className="h-3 w-3" />} label="Colocación" value={formatMoney(ultimo.colocacionSemana)} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* 1. Evolución del día */}
      {chartData.length >= 1 && (
        <Card className="border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">1. Evolución de la mora (hoy)</CardTitle>
            <p className="text-[11px] text-muted-foreground">Saldo registrado en cada corte horario de hoy.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <EvolucionTable chartData={chartData} snapshots={data.snapshots} />

            {chartData.length >= 2 ? (
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <AreaChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: 10 }}>
                    <defs>
                      <linearGradient id="moraFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#60A5FA" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#60A5FA" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="hora" tick={{ fill: '#8f8f9a', fontSize: 11 }} />
                    <YAxis
                      tick={{ fill: '#8f8f9a', fontSize: 11 }}
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                      width={55}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#181727', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12 }}
                      labelStyle={{ color: '#A898FF', fontSize: 11, fontWeight: 600 }}
                      formatter={(v) => formatMoney(Number(v ?? 0))}
                    />
                    {data.indicadores?.moraProyectadaCierre !== null && data.indicadores?.moraProyectadaCierre !== undefined && (
                      <ReferenceLine
                        y={data.indicadores.moraProyectadaCierre}
                        stroke="#A78BFA"
                        strokeDasharray="4 4"
                        label={{ value: `Proy. cierre $${(data.indicadores.moraProyectadaCierre / 1000).toFixed(0)}k`, fill: '#A78BFA', fontSize: 10, position: 'insideBottomRight' }}
                      />
                    )}
                    <Area type="monotone" dataKey="mora" stroke="#60A5FA" strokeWidth={2.5} fill="url(#moraFill)" dot={{ r: 3, fill: '#60A5FA' }} activeDot={{ r: 5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border/50 py-6 text-center text-sm text-muted-foreground">
                Se necesita un segundo corte para graficar la evolución.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 2. Semana MK (sáb–vie) */}
      {data.diasSemana.length > 0 && (
        <Card className="border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary-300" />
              2. Semana MK en curso
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">Mora pendiente al cierre de cada día (sáb–vie). El día en curso muestra el corte "ahora".</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                  <tr>
                    <th className="text-left py-2 pr-4">Día</th>
                    <th className="text-right py-2 px-4">Pactado</th>
                    <th className="text-right py-2 px-4">Cobrado</th>
                    <th className="text-right py-2 pl-4">Mora pendiente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {data.diasSemana.map((d) => (
                    <tr key={d.fechaIso} className={d.esHoy ? 'bg-primary-500/5' : ''}>
                      <td className="py-2 pr-4 font-medium capitalize">
                        {d.nombreCorto}
                        {d.esHoy && <span className="ml-2 text-[10px] uppercase tracking-wider text-primary-300">hoy</span>}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-muted-foreground">
                        {d.esFuturo ? '—' : formatMoney(d.pactadoAlCierre)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums">
                        {d.esFuturo ? '—' : formatMoney(d.cobradoAlCierre)}
                      </td>
                      <td className={`py-2 pl-4 text-right tabular-nums font-semibold ${d.esFuturo ? 'text-muted-foreground' : d.moraPendienteAlCierre > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {d.esFuturo ? '—' : formatMoney(d.moraPendienteAlCierre)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={semanaChartData} margin={{ top: 10, right: 20, bottom: 0, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="dia" tick={{ fill: '#8f8f9a', fontSize: 11 }} />
                  <YAxis
                    tick={{ fill: '#8f8f9a', fontSize: 11 }}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    width={55}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#181727', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12 }}
                    labelStyle={{ color: '#A898FF', fontSize: 11, fontWeight: 600 }}
                    formatter={(v) => v === null ? '—' : formatMoney(Number(v ?? 0))}
                  />
                  <Bar dataKey="mora" radius={[4, 4, 0, 0]}>
                    {semanaChartData.map((d, i) => (
                      <Cell key={i} fill={d.esFuturo ? '#333' : d.esHoy ? '#A78BFA' : '#F87171'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3. KPIs */}
      {data.indicadores && (
        <div>
          <h2 className="text-base font-semibold mb-2">3. Indicadores del día</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard icon={<TrendingDown className="h-3 w-3" />} label="Reducción acumulada" value={`${data.indicadores.reduccionAcumuladaPct}%`} sub="Desde el primer corte" valueClass={data.indicadores.reduccionAcumuladaPct >= 0 ? 'text-emerald-400' : 'text-rose-400'} />
            <KpiCard icon={<DollarSign className="h-3 w-3" />} label="Dinero reducido" value={formatMoney(data.indicadores.dineroReducido)} sub={`En ${data.indicadores.horasTranscurridas}h`} valueClass={data.indicadores.dineroReducido > 0 ? 'text-emerald-400' : 'text-muted-foreground'} />
            <KpiCard icon={<Zap className="h-3 w-3" />} label="Reducción promedio" value={formatMoney(data.indicadores.reduccionPromedioPorHora)} sub="Por hora" />
            <KpiCard icon={<Clock className="h-3 w-3" />} label="Último corte" value={`${data.indicadores.ultimoDeltaPct >= 0 ? '−' : '+'}${Math.abs(data.indicadores.ultimoDeltaPct)}%`} sub={`Δ ${formatMoney(Math.abs(data.indicadores.ultimoDeltaMonto))}`} valueClass={data.indicadores.ultimoDeltaPct > 0 ? 'text-emerald-400' : 'text-rose-400'} />
          </div>
        </div>
      )}

      {/* 4. Señales por reglas (complemento a la narrativa IA) */}
      {data.interpretacion && (
        <Card className="border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">4. Señales detectadas</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 text-sm list-decimal list-inside">
              {data.interpretacion.senales.map((s, i) => (
                <li key={i} className="text-muted-foreground">
                  <strong className="text-foreground">{s.titulo}:</strong> {s.texto}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

interface PagoEntrante {
  id: string
  fechaHora: string
  monto: number
  metodoPago: string
  statusTransferencia: string | null
  cliente: string
  cobrador: string
  sucursal: string
  tipo: string
}

/**
 * Tabla de evolución horaria. Cada fila es expandible y al abrirla
 * hace fetch al endpoint /api/reportes/tiempo-real/pagos con el rango
 * entre el corte actual y el anterior, mostrando los pagos que
 * movieron la mora en ese intervalo.
 */
function EvolucionTable({
  chartData, snapshots,
}: {
  chartData: Array<{ hora: string; mora: number; variacion: number }>
  snapshots: Array<{ capturadoEn: string }>
}) {
  const [expanded,   setExpanded]   = useState<number | null>(null)
  const [cache,      setCache]      = useState<Record<number, PagoEntrante[] | 'loading' | 'error'>>({})

  async function toggle(i: number) {
    if (expanded === i) { setExpanded(null); return }
    setExpanded(i)
    // No cargar el primer renglón (no hay "rango anterior").
    if (i === 0) return
    if (cache[i]) return
    const desde = snapshots[i - 1].capturadoEn
    const hasta = snapshots[i].capturadoEn
    setCache((prev) => ({ ...prev, [i]: 'loading' }))
    try {
      const url = `/api/reportes/tiempo-real/pagos?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const body = await res.json() as { pagos: PagoEntrante[] }
      setCache((prev) => ({ ...prev, [i]: body.pagos }))
    } catch {
      setCache((prev) => ({ ...prev, [i]: 'error' }))
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
          <tr>
            <th className="text-left py-2 pr-4 w-8"></th>
            <th className="text-left py-2 pr-4">Hora</th>
            <th className="text-right py-2 px-4">Saldo de mora</th>
            <th className="text-right py-2 pl-4">Variación</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/30">
          {chartData.map((row, i) => (
            <Fragment key={i}>
              <tr
                className={`cursor-pointer hover:bg-background/40 transition-colors ${expanded === i ? 'bg-background/40' : ''}`}
                onClick={() => toggle(i)}
              >
                <td className="py-2 pr-4 text-muted-foreground text-center">
                  {i === 0 ? '—' : (expanded === i ? '▼' : '▶')}
                </td>
                <td className="py-2 pr-4 font-medium">{row.hora}</td>
                <td className="py-2 px-4 text-right tabular-nums">{formatMoney(row.mora)}</td>
                <td className={`py-2 pl-4 text-right tabular-nums ${i === 0 ? 'text-muted-foreground' : row.variacion < 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {i === 0 ? '—' : formatVariacion(row.variacion)}
                </td>
              </tr>
              {expanded === i && i > 0 && (
                <tr>
                  <td colSpan={4} className="py-2 px-4 bg-background/20">
                    <PagosEnIntervalo entry={cache[i]} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PagosEnIntervalo({ entry }: { entry: PagoEntrante[] | 'loading' | 'error' | undefined }) {
  if (!entry || entry === 'loading') {
    return <p className="text-xs text-muted-foreground">Cargando pagos del intervalo…</p>
  }
  if (entry === 'error') {
    return <p className="text-xs text-rose-400">No se pudieron cargar los pagos. Reintenta.</p>
  }
  if (entry.length === 0) {
    return <p className="text-xs text-muted-foreground">No entraron pagos en este intervalo. La mora bajó por otro motivo (p.ej. recalculo o cancelación).</p>
  }
  const total = entry.reduce((s, p) => s + p.monto, 0)
  const pendientes = entry.filter((p) => p.statusTransferencia === 'PENDIENTE').length
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">
        <strong className="text-foreground">{entry.length}</strong> pago{entry.length === 1 ? '' : 's'} — total {formatMoney(total)}
        {pendientes > 0 && <span className="ml-2 text-amber-400">({pendientes} transferencia{pendientes === 1 ? '' : 's'} en validación)</span>}
      </p>
      <table className="w-full text-xs">
        <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left py-1 pr-3">Hora</th>
            <th className="text-left py-1 pr-3">Cliente</th>
            <th className="text-left py-1 pr-3">Cobrador</th>
            <th className="text-left py-1 pr-3">Sucursal</th>
            <th className="text-right py-1 pr-3">Método</th>
            <th className="text-right py-1">Monto</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/20">
          {entry.map((p) => (
            <tr key={p.id}>
              <td className="py-1 pr-3 text-muted-foreground tabular-nums">
                {new Date(p.fechaHora).toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: false })}
              </td>
              <td className="py-1 pr-3 truncate max-w-[200px]">{p.cliente}</td>
              <td className="py-1 pr-3 truncate max-w-[180px]">{p.cobrador}</td>
              <td className="py-1 pr-3 text-muted-foreground truncate max-w-[120px]">{p.sucursal}</td>
              <td className="py-1 pr-3 text-right text-muted-foreground">
                {p.metodoPago}
                {p.statusTransferencia === 'PENDIENTE' && <span className="ml-1 text-amber-400">(pend.)</span>}
              </td>
              <td className="py-1 text-right tabular-nums font-semibold">{formatMoney(p.monto)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function KpiRow({ icon, label, value, valueClass }: { icon: React.ReactNode; label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground flex items-center gap-1.5">{icon} {label}</span>
      <span className={`font-semibold tabular-nums ${valueClass ?? ''}`}>{value}</span>
    </div>
  )
}

function KpiCard({ icon, label, value, sub, valueClass }: { icon: React.ReactNode; label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <Card className="border-border/40">
      <CardContent className="p-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          {icon} {label}
        </p>
        <p className={`text-2xl font-bold tabular-nums mt-1 ${valueClass ?? ''}`}>{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  )
}
