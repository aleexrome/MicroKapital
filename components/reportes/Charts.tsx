'use client'

import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'

const PRIMARY = '#7B6FFF'
const PRIMARY_LIGHT = '#A898FF'
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
  tickFormatter?: (v: number) => string
}

export function ReportBarChart({
  data, xKey, series, height = 280, showLegend = true, tickFormatter,
}: BarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey={xKey} stroke="#8B7FFF" fontSize={11} />
        <YAxis stroke="#8B7FFF" fontSize={11} tickFormatter={tickFormatter} />
        <Tooltip {...TOOLTIP_STYLE} formatter={(v) => {
          const n = typeof v === 'number' ? v : Number(v ?? 0)
          return tickFormatter ? tickFormatter(n) : n.toLocaleString('es-MX')
        }} />
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
  tickFormatter?: (v: number) => string
}

export function ReportLineChart({
  data, xKey, series, height = 280, showLegend = true, tickFormatter,
}: LineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey={xKey} stroke="#8B7FFF" fontSize={11} />
        <YAxis stroke="#8B7FFF" fontSize={11} tickFormatter={tickFormatter} />
        <Tooltip {...TOOLTIP_STYLE} formatter={(v) => {
          const n = typeof v === 'number' ? v : Number(v ?? 0)
          return tickFormatter ? tickFormatter(n) : n.toLocaleString('es-MX')
        }} />
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
  tickFormatter?: (v: number) => string
}

export function ReportPieChart({
  data, height = 280, innerRadius = 60, outerRadius = 100, tickFormatter,
}: PieChartProps) {
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
        <Tooltip {...TOOLTIP_STYLE} formatter={(v) => {
          const n = typeof v === 'number' ? v : Number(v ?? 0)
          return tickFormatter ? tickFormatter(n) : n.toLocaleString('es-MX')
        }} />
        <Legend wrapperStyle={{ fontSize: '12px' }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

export { PRIMARY, PRIMARY_LIGHT, COLORS }
