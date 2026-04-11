'use client'

import {
  PieChart, Pie, Cell, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'

// ── Theme palette (matches the dark theme) ───────────────────────────────────
const C = {
  purple:  '#7B6FFF',
  emerald: '#10b981',
  amber:   '#f59e0b',
  red:     '#ef4444',
  blue:    '#3b82f6',
  indigo:  '#6366f1',
  slate:   '#64748b',
  muted:   '#80809A',
  border:  '#252440',
  card:    '#181727',
  fg:      '#E6E4F8',
}

// ── Shared tooltip style ──────────────────────────────────────────────────────
const tooltipStyle = {
  backgroundColor: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  color: C.fg,
  fontSize: 13,
}

// ── Custom legend rendered below each donut ───────────────────────────────────
function DonutLegend({ items }: { items: { label: string; color: string; value: number }[] }) {
  const total = items.reduce((s, i) => s + i.value, 0)
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5 text-xs" style={{ color: C.muted }}>
          <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
          <span>{item.label}</span>
          <span style={{ color: C.fg }} className="font-semibold">
            {item.value}
            {total > 0 && (
              <span style={{ color: C.muted }} className="font-normal ml-0.5">
                ({((item.value / total) * 100).toFixed(0)}%)
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Custom center label inside the donut ─────────────────────────────────────
function DonutCenter({ total, label }: { total: number; label: string }) {
  return (
    <text
      x="50%" y="50%"
      textAnchor="middle" dominantBaseline="middle"
      fill={C.fg}
    >
      <tspan x="50%" dy="-0.4em" fontSize={26} fontWeight={700}>{total}</tspan>
      <tspan x="50%" dy="1.5em" fontSize={11} fill={C.muted}>{label}</tspan>
    </text>
  )
}

// ── Chart 1: Distribución de créditos por estado ──────────────────────────────
export interface LoanStatusData {
  estado: string
  count: number
}

const ESTADO_META: Record<string, { label: string; color: string }> = {
  ACTIVE:           { label: 'Activos',    color: C.emerald },
  PENDING_APPROVAL: { label: 'Pendientes', color: C.amber   },
  APPROVED:         { label: 'Aprobados',  color: C.blue    },
  LIQUIDATED:       { label: 'Liquidados', color: C.purple  },
  REJECTED:         { label: 'Rechazados', color: C.red     },
}

export function LoanStatusChart({ data }: { data: LoanStatusData[] }) {
  const items = data
    .filter((d) => d.count > 0)
    .map((d) => ({
      label: ESTADO_META[d.estado]?.label ?? d.estado,
      color: ESTADO_META[d.estado]?.color ?? C.slate,
      value: d.count,
    }))

  const total = items.reduce((s, i) => s + i.value, 0)

  return (
    <div>
      <h3 className="text-sm font-semibold mb-1" style={{ color: C.fg }}>Estado de la Cartera</h3>
      <p className="text-xs mb-3" style={{ color: C.muted }}>Distribución de todos los créditos</p>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={items}
            dataKey="value"
            nameKey="label"
            cx="50%" cy="50%"
            innerRadius={62} outerRadius={88}
            paddingAngle={2}
            strokeWidth={0}
          >
            {items.map((item) => (
              <Cell key={item.label} fill={item.color} opacity={0.9} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v) => [`${v}`, '']}
            cursor={false}
          />
          {total > 0 && <DonutCenter total={total} label="créditos" />}
        </PieChart>
      </ResponsiveContainer>
      <DonutLegend items={items} />
    </div>
  )
}

// ── Chart 2: Pagos del mes ────────────────────────────────────────────────────
export interface MonthPaymentsData {
  pagados:    number   // PAID schedules this month
  vencidos:   number   // PENDING/PARTIAL + date < today
  porCobrar:  number   // PENDING + date >= today
}

export function MonthPaymentsChart({ data }: { data: MonthPaymentsData }) {
  const items = [
    { label: 'Pagados',    color: C.emerald, value: data.pagados   },
    { label: 'Vencidos',   color: C.red,     value: data.vencidos  },
    { label: 'Por cobrar', color: C.amber,   value: data.porCobrar },
  ].filter((i) => i.value > 0)

  const total = items.reduce((s, i) => s + i.value, 0)

  // If no data at all show empty state
  if (total === 0) {
    return (
      <div>
        <h3 className="text-sm font-semibold mb-1" style={{ color: C.fg }}>Pagos del Mes</h3>
        <p className="text-xs mb-3" style={{ color: C.muted }}>Calendario de cobros del mes en curso</p>
        <div className="flex items-center justify-center h-[200px]">
          <p className="text-xs" style={{ color: C.muted }}>Sin pagos programados este mes</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h3 className="text-sm font-semibold mb-1" style={{ color: C.fg }}>Pagos del Mes</h3>
      <p className="text-xs mb-3" style={{ color: C.muted }}>Calendario de cobros del mes en curso</p>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={items}
            dataKey="value"
            nameKey="label"
            cx="50%" cy="50%"
            innerRadius={62} outerRadius={88}
            paddingAngle={2}
            strokeWidth={0}
          >
            {items.map((item) => (
              <Cell key={item.label} fill={item.color} opacity={0.9} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v) => [`${v} pagos`, '']}
            cursor={false}
          />
          {total > 0 && <DonutCenter total={total} label="pagos" />}
        </PieChart>
      </ResponsiveContainer>
      <DonutLegend items={items} />
    </div>
  )
}
