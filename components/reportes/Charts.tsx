'use client'

import { useState, useEffect } from 'react'
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'

const COLORS = ['#7B6FFF', '#22d3ee', '#34d399', '#fbbf24', '#f97316', '#f43f5e']

const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: '#181727',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '12px',
    color: '#E6E4F8',
    fontSize: '12px',
  },
  labelStyle: { color: '#A898FF', fontSize: '11px', fontWeight: 600 },
  itemStyle: { color: '#E6E4F8' },
}

/**
 * Formatos serializables (string en lugar de función) para que los charts
 * los reciban como prop desde un Server Component sin romper la regla de
 * serialización de RSC. Pasar funciones de Server → Client tira el SSR
 * sin mensaje claro en producción.
 */
type FormatterId = 'money' | 'currencyK' | 'count' | 'percent'

function formatValue(v: number | string | undefined, id: FormatterId | undefined): string {
  const n = typeof v === 'number' ? v : Number(v ?? 0)
  if (!Number.isFinite(n)) return '0'
  switch (id) {
    case 'money':
      return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(n)
    case 'currencyK':
      return n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n.toFixed(0)}`
    case 'percent':
      return `${n.toFixed(1)}%`
    case 'count':
    default:
      return n.toLocaleString('es-MX')
  }
}

/**
 * recharts depende de medir el DOM (ResizeObserver, dimensiones del padre)
 * y renderiza HTML distinto en server vs client → produce hydration
 * mismatch. Skipear el SSR del chart con un mount-gate: server render =
 * placeholder vacío, client monta el chart real después de hidratar.
 */
function useMounted() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted
}

export interface BarSeries {
  dataKey: string
  name: string
  color?: string
  stackId?: string
}

interface BarChartProps {
  data: Array<Record<string, string | number>>
  xKey: string
  series: BarSeries[]
  height?: number
  showLegend?: boolean
  formatter?: FormatterId
}

export function ReportBarChart({
  data, xKey, series, height = 280, showLegend = true, formatter,
}: BarChartProps) {
  const mounted = useMounted()
  if (!mounted) return <div style={{ height }} aria-hidden />
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey={xKey} stroke="#8B7FFF" fontSize={11} />
        <YAxis stroke="#8B7FFF" fontSize={11} tickFormatter={(v) => formatValue(v, formatter)} />
        <Tooltip {...TOOLTIP_STYLE} formatter={(v) => formatValue(v as number, formatter)} />
        {showLegend && <Legend wrapperStyle={{ fontSize: '12px' }} />}
        {series.map((s, i) => (
          <Bar
            key={s.dataKey}
            dataKey={s.dataKey}
            name={s.name}
            fill={s.color ?? COLORS[i % COLORS.length]}
            stackId={s.stackId}
            radius={[6, 6, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

interface LineChartProps {
  data: Array<Record<string, string | number>>
  xKey: string
  series: BarSeries[]
  height?: number
  showLegend?: boolean
  formatter?: FormatterId
}

export function ReportLineChart({
  data, xKey, series, height = 280, showLegend = true, formatter,
}: LineChartProps) {
  const mounted = useMounted()
  if (!mounted) return <div style={{ height }} aria-hidden />
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey={xKey} stroke="#8B7FFF" fontSize={11} />
        <YAxis stroke="#8B7FFF" fontSize={11} tickFormatter={(v) => formatValue(v, formatter)} />
        <Tooltip {...TOOLTIP_STYLE} formatter={(v) => formatValue(v as number, formatter)} />
        {showLegend && <Legend wrapperStyle={{ fontSize: '12px' }} />}
        {series.map((s, i) => (
          <Line
            key={s.dataKey}
            type="monotone"
            dataKey={s.dataKey}
            name={s.name}
            stroke={s.color ?? COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

interface PieDataItem {
  name: string
  value: number
  color?: string
}

interface PieChartProps {
  data: PieDataItem[]
  height?: number
  innerRadius?: number
  outerRadius?: number
  formatter?: FormatterId
}

export function ReportPieChart({
  data, height = 280, innerRadius = 60, outerRadius = 100, formatter,
}: PieChartProps) {
  const mounted = useMounted()
  if (!mounted) return <div style={{ height }} aria-hidden />
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          paddingAngle={2}
        >
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color ?? COLORS[i % COLORS.length]} stroke="#181727" strokeWidth={2} />
          ))}
        </Pie>
        <Tooltip {...TOOLTIP_STYLE} formatter={(v) => formatValue(v as number, formatter)} />
        <Legend wrapperStyle={{ fontSize: '12px' }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

export { COLORS }
