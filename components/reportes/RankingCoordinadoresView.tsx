'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatMoney } from '@/lib/utils'
import { Trophy, TrendingDown, Users, Calendar } from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import type { RankingCoordinadores, CoordinadorRanking } from '@/lib/reportes/rankingCoordinadores'

type Metrica = 'cobranza' | 'colocacion' | 'score'

const COLORES_TIER = {
  top:    '#10B981',  // emerald-500
  bottom: '#EF4444',  // red-500
  medio:  '#64748B',  // slate-500
}

const PERIODOS: Array<{ semanas: number; label: string }> = [
  { semanas: 1,  label: 'Esta semana'  },
  { semanas: 4,  label: 'Últimas 4'    },
  { semanas: 8,  label: 'Últimas 8'    },
  { semanas: 12, label: 'Últimas 12'   },
]

export function RankingCoordinadoresView({
  data,
  semanasActual = 8,
}: {
  data: RankingCoordinadores
  semanasActual?: number
}) {
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
            {data.empresa} · {data.semanas.length === 1 ? 'esta semana' : `últimas ${data.semanas.length} semanas`} MK · se actualiza una vez al día.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Toggle de periodo (acota/expande el rango de semanas) */}
          <div className="flex items-center gap-1 rounded-lg border border-border/50 bg-background/40 p-1 text-xs">
            {PERIODOS.map((p) => (
              <Link
                key={p.semanas}
                href={`/reportes/ranking-coordinadores?semanas=${p.semanas}`}
                scroll={false}
                className={`px-3 py-1.5 rounded-md transition-colors ${semanasActual === p.semanas ? 'bg-primary-500/20 text-primary-200 font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {p.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border/50 bg-background/40 p-1 text-xs">
            <MetricaBtn active={metrica === 'cobranza'}   onClick={() => setMetrica('cobranza')}>Cobranza %</MetricaBtn>
            <MetricaBtn active={metrica === 'colocacion'} onClick={() => setMetrica('colocacion')}>Colocación $</MetricaBtn>
            <MetricaBtn active={metrica === 'score'}      onClick={() => setMetrica('score')}>Score</MetricaBtn>
          </div>
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
                {(['bottom', 'medio', 'top'] as const).map((tier) =>
                  data.coordinadores
                    .filter((c) => c.tier === tier)
                    .map((c) => (
                      <Line
                        key={c.cobradorId}
                        dataKey={c.cobradorId}
                        type="monotone"
                        stroke={COLORES_TIER[c.tier]}
                        strokeWidth={c.tier === 'medio' ? 1.2 : 2.2}
                        strokeOpacity={c.tier === 'medio' ? 0.35 : 1}
                        dot={(props) => (
                          <AvatarDot
                            key={`dot-${c.cobradorId}-${props.index}`}
                            cx={props.cx}
                            cy={props.cy}
                            coord={c}
                            // Avatar grande SOLO en el último punto de la línea
                            // top/bottom; resto quedan como puntos pequeños.
                            variante={
                              c.tier === 'medio'
                                ? 'punto'
                                : props.index === chartData.length - 1
                                  ? 'avatar'
                                  : 'punto'
                            }
                            tier={c.tier}
                          />
                        )}
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
            Ordenado por score global de las últimas 4 semanas. El score mezcla
            eficiencia % (30% cobranza, 10% colocación) con volumen absoluto
            relativo al grupo (40% $ cobrados, 20% $ colocados) — un coord con
            100% pero pactado chico no rankea arriba.
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
                  <th className="text-right py-2 px-4">Cobranza %</th>
                  <th className="text-right py-2 px-4">$ Cobrado prom.</th>
                  <th className="text-right py-2 px-4">$ Colocado prom.</th>
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
                    <td className="py-2 pr-4 font-medium">
                      <div className="flex items-center gap-2">
                        <AvatarCircle coord={c} size={28} />
                        <span>{c.nombre}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">{c.sucursal}</td>
                    <td className={`py-2 px-4 text-right tabular-nums ${pctColor(c.cobranzaPromedio)}`}>
                      {c.cobranzaPromedio}%
                    </td>
                    <td className="py-2 px-4 text-right tabular-nums">{formatMoney(c.cobradoPromedio ?? 0)}</td>
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

/**
 * Dot personalizado de Recharts que renderiza la foto circular del
 * coord en el punto final de su línea (top/bottom), o un círculo
 * pequeño en los puntos intermedios y en los coords del medio.
 * Si no hay fotoUrl, cae a iniciales.
 */
function AvatarDot({
  cx, cy, coord, variante, tier,
}: {
  cx?: number
  cy?: number
  coord: CoordinadorRanking
  variante: 'punto' | 'avatar'
  tier: 'top' | 'bottom' | 'medio'
  indiceUltimo?: number
}) {
  if (cx === undefined || cy === undefined) return null
  const color = COLORES_TIER[tier]

  if (variante === 'punto') {
    return (
      <circle
        cx={cx}
        cy={cy}
        r={tier === 'medio' ? 1.5 : 3}
        fill={color}
        stroke="#0F0F14"
        strokeWidth={0.5}
      />
    )
  }

  // Avatar grande para el último punto de top/bottom. Usamos foreignObject
  // con <img> HTML en vez de SVG <image> porque la última no renderiza
  // URLs cross-origin de Cloudinary de forma confiable en todos los
  // browsers (Safari a veces las ignora silenciosamente).
  const size = 28
  const iniciales = getIniciales(coord)
  return (
    <g>
      <foreignObject x={cx - size / 2} y={cy - size / 2} width={size} height={size}>
        {/* xmlns requerido para que el HTML dentro del SVG renderice en
            todos los browsers (Firefox lo tolera, Safari no). */}
        <div
          {...{ xmlns: 'http://www.w3.org/1999/xhtml' }}
          style={{
            width:  size,
            height: size,
            borderRadius: '50%',
            overflow: 'hidden',
            border: `2px solid ${color}`,
            background: '#1C1C24',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
            fontSize: 10,
            fontWeight: 700,
            color: '#E6E4F8',
            boxSizing: 'border-box',
          }}
        >
          {coord.fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coord.fotoUrl}
              alt={coord.nombre}
              referrerPolicy="no-referrer"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            iniciales
          )}
        </div>
      </foreignObject>
    </g>
  )
}

function getIniciales(coord: CoordinadorRanking): string {
  // Fallback defensivo: si el server no envió iniciales (cache viejo
  // del PR anterior), las derivamos del nombre en el cliente.
  if (coord.iniciales) return coord.iniciales
  const parts = (coord.nombre ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function AvatarCircle({ coord, size = 32 }: { coord: CoordinadorRanking; size?: number }) {
  const [error, setError] = useState(false)
  const url = coord.fotoUrl && !error ? coord.fotoUrl : null
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={coord.nombre}
      referrerPolicy="no-referrer"
      onError={() => setError(true)}
      className="rounded-full object-cover flex-shrink-0 bg-background/80"
      style={{ width: size, height: size }}
    />
  ) : (
    <div
      className="rounded-full bg-background/80 border border-border/50 flex items-center justify-center font-semibold text-foreground flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {getIniciales(coord)}
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
  const medalla = c.puesto === 1 ? '🥇' : c.puesto === 2 ? '🥈' : c.puesto === 3 ? '🥉' : null
  const ringColor = tono === 'emerald' ? 'ring-emerald-500/60' : 'ring-rose-500/60'
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`relative flex-shrink-0 rounded-full ring-2 ${ringColor}`}>
          <AvatarCircle coord={c} size={40} />
          {medalla && (
            <span className="absolute -bottom-1 -right-1 text-sm bg-background rounded-full px-0.5">{medalla}</span>
          )}
        </div>
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
