'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatMoney } from '@/lib/utils'
import { TrendingDown, Activity, Zap, Clock, Target, RefreshCw, Wallet, TrendingUp, Percent, DollarSign } from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Area, AreaChart,
} from 'recharts'
import type { ReporteTiempoRealCobranza } from '@/lib/reportes/tiempoReal'

const REFRESH_MS = 2 * 60 * 1000  // 2 min

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
      } catch { /* silencio — se reintenta al siguiente tick */ }
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
      cobrado:   s.cobradoSemana,
    }
  })
  const ultimo = data.snapshots[data.snapshots.length - 1]
  const avancePct = ultimo && ultimo.pactadoSemana > 0
    ? Math.round((ultimo.cobradoSemana / ultimo.pactadoSemana) * 100)
    : 0

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

      {/* Sin datos */}
      {data.snapshots.length === 0 && (
        <Card className="border-border/40">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Aún no hay snapshots registrados hoy. Vuelve a cargar esta página entre 8:00 y 20:00 CDMX
            y se generará el primer corte automáticamente.
          </CardContent>
        </Card>
      )}

      {/* Resumen gerencial arriba (tipo ChatGPT) */}
      {data.interpretacion && (
        <Card className={`border-border/40 bg-gradient-to-br ${tonoBg} to-background`}>
          <CardContent className="py-5">
            <p className={`text-base font-medium ${tonoColor}`}>{data.interpretacion.resumen}</p>
          </CardContent>
        </Card>
      )}

      {/* Hero: mora + estado actual (siempre visible con 1+ snapshot) */}
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

      {/* 1. Evolución — tabla + gráfica */}
      {chartData.length >= 1 && (
        <Card className="border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">1. Evolución de la mora</CardTitle>
            <p className="text-[11px] text-muted-foreground">Saldo registrado en cada corte horario de hoy.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Tabla tipo GPT */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                  <tr>
                    <th className="text-left py-2 pr-4">Hora</th>
                    <th className="text-right py-2 px-4">Saldo de mora</th>
                    <th className="text-right py-2 pl-4">Variación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {chartData.map((row, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-4 font-medium">{row.hora}</td>
                      <td className="py-2 px-4 text-right tabular-nums">{formatMoney(row.mora)}</td>
                      <td className={`py-2 pl-4 text-right tabular-nums ${i === 0 ? 'text-muted-foreground' : row.variacion < 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {i === 0 ? '—' : formatVariacion(row.variacion)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Gráfica (requiere 2+ snapshots) */}
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
              <div className="rounded-lg border border-dashed border-border/50 py-8 text-center text-sm text-muted-foreground">
                Se necesita un segundo corte para graficar la evolución.<br />
                <span className="text-xs">El siguiente snapshot se generará cuando vuelvas a abrir esta página pasados 25 min.</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 2. Indicadores (requiere 2+ snapshots) */}
      {data.indicadores && (
        <div>
          <h2 className="text-base font-semibold mb-2">2. Indicadores importantes</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              icon={<TrendingDown className="h-3 w-3" />}
              label="Reducción acumulada"
              value={`${data.indicadores.reduccionAcumuladaPct}%`}
              sub="Desde el primer corte del día"
              valueClass={data.indicadores.reduccionAcumuladaPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}
            />
            <KpiCard
              icon={<DollarSign className="h-3 w-3" />}
              label="Dinero reducido"
              value={formatMoney(data.indicadores.dineroReducido)}
              sub={`En ${data.indicadores.horasTranscurridas}h`}
              valueClass={data.indicadores.dineroReducido > 0 ? 'text-emerald-400' : 'text-muted-foreground'}
            />
            <KpiCard
              icon={<Zap className="h-3 w-3" />}
              label="Reducción promedio"
              value={formatMoney(data.indicadores.reduccionPromedioPorHora)}
              sub="Por hora"
            />
            <KpiCard
              icon={<Clock className="h-3 w-3" />}
              label="Último corte"
              value={`${data.indicadores.ultimoDeltaPct >= 0 ? '−' : '+'}${Math.abs(data.indicadores.ultimoDeltaPct)}%`}
              sub={`Δ ${formatMoney(Math.abs(data.indicadores.ultimoDeltaMonto))}`}
              valueClass={data.indicadores.ultimoDeltaPct > 0 ? 'text-emerald-400' : 'text-rose-400'}
            />
          </div>
        </div>
      )}

      {/* 3. Interpretación gerencial */}
      {data.interpretacion && (
        <Card className="border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">3. Mi interpretación gerencial</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Hay señales interesantes:</p>
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

function KpiRow({
  icon, label, value, valueClass,
}: { icon: React.ReactNode; label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground flex items-center gap-1.5">{icon} {label}</span>
      <span className={`font-semibold tabular-nums ${valueClass ?? ''}`}>{value}</span>
    </div>
  )
}

function KpiCard({
  icon, label, value, sub, valueClass,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  valueClass?: string
}) {
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
