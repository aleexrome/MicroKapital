'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatMoney } from '@/lib/utils'
import { Trophy, Medal, TrendingDown, Users, Calendar } from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceArea,
} from 'recharts'
import type { RankingCoordinadores, CoordinadorRanking } from '@/lib/reportes/rankingCoordinadores'

type Metrica = 'cobranza' | 'colocacion' | 'score'

const COLORES_TIER = {
  top:    '#10B981',  // emerald-500
  bottom: '#EF4444',  // red-500
  medio:  '#64748B',  // slate-500
}

export function RankingCoordinadoresView({ data }: { data: RankingCoordinadores }) {
  const [metrica, setMetrica] = useState<Metrica>('cobranza')

  // Transformar datos a formato wide para Recharts:
  // [{ label: "4-10 nov", "Juan|Toluca": 85, "María|Veracruz": 72, ... }]
  const chartData = useMemo(() => {
    return data.semanas.map((sem, i) => {
      const row: Record<string, string | number> = { label: sem.label }
      for (const c of data.coordinadores) {
        const punto = c.serie[i]
        if (!punto) continue
        const val = metrica === 'cobranza' ? punto.cobranzaPct
                 : metrica === 'colocacion' ? punto.colocacion
                 : punto.score
        row[`${c.cobradorId}`] = val
      }
      return row
    })
  }, [data, metrica])

  const metricaLabel = metrica === 'cobranza' ? 'Cobranza %'
                     : metrica === 'colocacion' ? 'Colocación $'
                     : 'Score global'

  const formatY = (v: number) => metrica === 'colocacion'
    ? `$${(v / 1000).toFixed(0)}k`
    : `${v}%`

  const top3    = data.coordinadores.filter((c) => c.tier === 'top')
  const bottom3 = data.coordinadores.filter((c) => c.tier === 'bottom')

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary-300" />
            Ranking de coordinadores
          </h1>
          <p className="text-muted-foreground text-sm">
            {data.empresa} · últimas {data.semanas.length} semanas MK · se actualiza una vez al día.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border/50 bg-background/40 p-1 text-xs">
          <MetricaBtn active={metrica === 'cobranza'}   onClick={() => setMetrica('cobranza')}>Cobranza %</MetricaBtn>
          <MetricaBtn active={metrica === 'colocacion'} onClick={() => setMetrica('colocacion')}>Colocación $</MetricaBtn>
          <MetricaBtn active={metrica === 'score'}      onClick={() => setMetrica('score')}>Score</MetricaBtn>
        </div>
      </div>

      {/* Top 3 / Bottom 3 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-emerald-500/40 bg-gradient-to-br from-emerald-950/30 to-background">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-emerald-300">
              <Trophy className="h-4 w-4" />
              Top 3 — mejores del período
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {top3.map((c) => (
              <PodioRow key={c.cobradorId} c={c} tono="emerald" />
            ))}
            {top3.length === 0 && <p className="text-xs text-muted-foreground">Sin datos suficientes aún.</p>}
          </CardContent>
        </Card>

        <Card className="border-rose-500/40 bg-gradient-to-br from-rose-950/30 to-background">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-rose-300">
              <TrendingDown className="h-4 w-4" />
              Bottom 3 — necesitan refuerzo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {bottom3.map((c) => (
              <PodioRow key={c.cobradorId} c={c} tono="rose" />
            ))}
            {bottom3.length === 0 && <p className="text-xs text-muted-foreground">Sin datos suficientes aún.</p>}
          </CardContent>
        </Card>
      </div>

      {/* Gráfica lineal */}
      <Card className="border-border/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary-300" />
            Evolución semana con semana · {metricaLabel}
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Verde = top 3, rojo = bottom 3, gris = resto. Pasa el mouse sobre una línea para ver nombre y sucursal.
          </p>
        </CardHeader>
        <CardContent>
          <div style={{ width: '100%', height: 420 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="label" tick={{ fill: '#8f8f9a', fontSize: 11 }} />
                <YAxis
                  tick={{ fill: '#8f8f9a', fontSize: 11 }}
                  tickFormatter={formatY}
                  width={60}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#181727', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12, maxHeight: 400, overflow: 'auto' }}
                  labelStyle={{ color: '#A898FF', fontSize: 11, fontWeight: 600 }}
                  formatter={(v, nameId) => {
                    const id = String(nameId ?? '')
                    const coord = data.coordinadores.find((c) => c.cobradorId === id)
                    if (!coord) return [String(v ?? ''), id]
                    const valor = metrica === 'colocacion' ? formatMoney(Number(v ?? 0)) : `${v}${metrica === 'cobranza' || metrica === 'score' ? '%' : ''}`
                    return [valor, `${coord.nombre} · ${coord.sucursal}`]
                  }}
                />
                {/* Líneas bottom primero (atrás), luego medio, luego top (al frente) */}
                {['bottom', 'medio', 'top'].map((tier) =>
                  data.coordinadores
                    .filter((c) => c.tier === tier)
                    .map((c) => (
                      <Line
                        key={c.cobradorId}
                        dataKey={c.cobradorId}
                        type="monotone"
                        stroke={COLORES_TIER[c.tier]}
                        strokeWidth={c.tier === 'medio' ? 1.2 : 2.2}
                        strokeOpacity={c.tier === 'medio' ? 0.4 : 1}
                        dot={{ r: c.tier === 'medio' ? 1.5 : 3 }}
                        activeDot={{ r: 5 }}
                        name={c.cobradorId}
                        connectNulls
                      />
                    )),
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Tabla ranking completa */}
      <Card className="border-border/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Ranking actual ({data.coordinadores.length} coordinadores)</CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Ordenado por score promedio de las últimas 4 semanas.
            Top 3 en verde, bottom 3 en rojo.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                <tr>
                  <th className="text-left py-2 pr-4">#</th>
                  <th className="text-left py-2 pr-4">Coordinador</th>
                  <th className="text-left py-2 pr-4">Sucursal</th>
                  <th className="text-right py-2 px-4">Cobranza prom.</th>
                  <th className="text-right py-2 px-4">Colocación prom.</th>
                  <th className="text-right py-2 pl-4">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {data.coordinadores.map((c) => (
                  <tr
                    key={c.cobradorId}
                    className={
                      c.tier === 'top'    ? 'bg-emerald-500/5' :
                      c.tier === 'bottom' ? 'bg-rose-500/5'    : ''
                    }
                  >
                    <td className="py-2 pr-4 font-bold tabular-nums">
                      {c.puesto === 1 && '🥇 '}
                      {c.puesto === 2 && '🥈 '}
                      {c.puesto === 3 && '🥉 '}
                      {c.puesto > 3 && c.puesto}
                    </td>
                    <td className="py-2 pr-4 font-medium">{c.nombre}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{c.sucursal}</td>
                    <td className={`py-2 px-4 text-right tabular-nums ${pctColor(c.cobranzaPromedio)}`}>
                      {c.cobranzaPromedio}%
                    </td>
                    <td className="py-2 px-4 text-right tabular-nums">{formatMoney(c.colocacionPromedio)}</td>
                    <td className={`py-2 pl-4 text-right tabular-nums font-bold ${pctColor(c.scorePromedio)}`}>
                      {c.scorePromedio}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground text-center">
        Reporte generado el {new Date(data.generadoEn).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}.
        Se recalcula una vez al día.
      </p>
    </div>
  )
}

function MetricaBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md transition-colors ${active ? 'bg-primary-500/20 text-primary-200 font-medium' : 'text-muted-foreground hover:text-foreground'}`}
    >
      {children}
    </button>
  )
}

function PodioRow({ c, tono }: { c: CoordinadorRanking; tono: 'emerald' | 'rose' }) {
  const icon = c.puesto === 1 ? '🥇' : c.puesto === 2 ? '🥈' : c.puesto === 3 ? '🥉' : null
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-lg flex-shrink-0">{icon ?? <Medal className="h-4 w-4" />}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{c.nombre}</p>
          <p className="text-[11px] text-muted-foreground truncate">{c.sucursal}</p>
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`text-base font-bold tabular-nums text-${tono}-300`}>{c.scorePromedio}</p>
        <p className="text-[10px] text-muted-foreground">score prom.</p>
      </div>
    </div>
  )
}

function pctColor(pct: number): string {
  if (pct >= 85) return 'text-emerald-400'
  if (pct >= 60) return 'text-amber-400'
  return 'text-rose-400'
}
