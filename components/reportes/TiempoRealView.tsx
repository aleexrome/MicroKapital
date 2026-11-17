'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatMoney } from '@/lib/utils'
import { TrendingDown, Activity, Zap, Clock, Target, RefreshCw } from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
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

  const chartData = data.snapshots.map((s) => ({
    hora:  formatHora(s.capturadoEn),
    mora:  s.moraPendienteSemana,
    cobrado: s.cobradoSemana,
  }))
  const ultimo = data.snapshots[data.snapshots.length - 1]

  const tonoColor = data.interpretacion?.tono === 'positivo' ? 'text-emerald-400'
                  : data.interpretacion?.tono === 'neutro'   ? 'text-amber-400'
                  : 'text-rose-400'

  return (
    <div className="p-6 space-y-5">
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
            Aún no hay snapshots registrados hoy. El primer corte se guarda a las 8:00 CDMX
            y de ahí cada 30 minutos hasta las 20:00.
          </CardContent>
        </Card>
      )}

      {ultimo && (
        <Card className="border-primary-500/40 bg-gradient-to-br from-primary-950/40 to-background">
          <CardHeader className="pb-2">
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-primary-300" />
                Mora pendiente de la semana
              </CardTitle>
              <span className="text-[11px] text-muted-foreground">
                corte {formatHora(ultimo.capturadoEn)}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-3 flex-wrap">
              <p className="text-3xl font-bold tabular-nums">{formatMoney(ultimo.moraPendienteSemana)}</p>
              {data.indicadores && (
                <Badge className={`${data.indicadores.ultimoDeltaMonto > 0 ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' : 'bg-rose-500/15 text-rose-300 border-rose-500/40'}`}>
                  {data.indicadores.ultimoDeltaMonto > 0 ? '▼' : '▲'} {Math.abs(data.indicadores.ultimoDeltaPct)}% último corte
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Es el pactado que ya venció esta semana y aún no entra — baja conforme los coords cobran durante el día.
            </p>
          </CardContent>
        </Card>
      )}

      {chartData.length >= 2 && (
        <Card className="border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Evolución horaria</CardTitle>
            <p className="text-[11px] text-muted-foreground">Saldo de mora registrado en cada corte del día de hoy.</p>
          </CardHeader>
          <CardContent>
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: 10 }}>
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
                  <Line type="monotone" dataKey="mora" stroke="#60A5FA" strokeWidth={2.5} dot={{ r: 3, fill: '#60A5FA' }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {data.indicadores && (
        <div>
          <h2 className="text-base font-semibold mb-2">Indicadores importantes</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi
              icon={<TrendingDown className="h-3 w-3" />}
              label="Reducción acumulada"
              value={`${data.indicadores.reduccionAcumuladaPct}%`}
              sub="Desde el primer corte del día"
              valueClass={data.indicadores.reduccionAcumuladaPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}
            />
            <Kpi
              icon={<Target className="h-3 w-3" />}
              label="Dinero reducido"
              value={formatMoney(data.indicadores.dineroReducido)}
              sub={`En ${data.indicadores.horasTranscurridas}h`}
              valueClass={data.indicadores.dineroReducido > 0 ? 'text-emerald-400' : 'text-muted-foreground'}
            />
            <Kpi
              icon={<Zap className="h-3 w-3" />}
              label="Reducción promedio"
              value={formatMoney(data.indicadores.reduccionPromedioPorHora)}
              sub="Por hora"
            />
            <Kpi
              icon={<Clock className="h-3 w-3" />}
              label="Último corte"
              value={`${data.indicadores.ultimoDeltaPct >= 0 ? '−' : '+'}${Math.abs(data.indicadores.ultimoDeltaPct)}%`}
              sub={`Δ ${formatMoney(Math.abs(data.indicadores.ultimoDeltaMonto))}`}
              valueClass={data.indicadores.ultimoDeltaPct > 0 ? 'text-emerald-400' : 'text-rose-400'}
            />
          </div>
        </div>
      )}

      {data.interpretacion && (
        <Card className="border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Interpretación gerencial</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className={`text-sm font-medium ${tonoColor}`}>{data.interpretacion.resumen}</p>
            <ol className="space-y-1.5 text-sm text-muted-foreground list-decimal list-inside">
              {data.interpretacion.senales.map((s, i) => (
                <li key={i}>
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

function Kpi({
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
        <p className={`text-xl font-bold tabular-nums mt-1 ${valueClass ?? ''}`}>{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  )
}
