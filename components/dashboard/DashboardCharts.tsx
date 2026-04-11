'use client'

import {
  PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer,
} from 'recharts'

// ── Theme palette ─────────────────────────────────────────────────────────────
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

const tooltipStyle = {
  backgroundColor: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  color: C.fg,
  fontSize: 13,
}

// ── Helpers ───────────────────────────────────────────────────────────────────
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

function DonutCenter({ total, label }: { total: number; label: string }) {
  return (
    <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fill={C.fg}>
      <tspan x="50%" dy="-0.4em" fontSize={26} fontWeight={700}>{total}</tspan>
      <tspan x="50%" dy="1.5em" fontSize={11} fill={C.muted}>{label}</tspan>
    </text>
  )
}

function EmptyChart({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-1" style={{ color: C.fg }}>{title}</h3>
      <p className="text-xs mb-3" style={{ color: C.muted }}>{subtitle}</p>
      <div className="flex items-center justify-center h-[200px]">
        <p className="text-xs" style={{ color: C.muted }}>Sin datos disponibles</p>
      </div>
    </div>
  )
}

// ── Chart 1: Estado de la Cartera (donut) ────────────────────────────────────
export interface LoanStatusData { estado: string; count: number }

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
    .map((d) => ({ label: ESTADO_META[d.estado]?.label ?? d.estado, color: ESTADO_META[d.estado]?.color ?? C.slate, value: d.count }))
  const total = items.reduce((s, i) => s + i.value, 0)
  if (total === 0) return <EmptyChart title="Estado de la Cartera" subtitle="Distribución de todos los créditos" />

  return (
    <div>
      <h3 className="text-sm font-semibold mb-1" style={{ color: C.fg }}>Estado de la Cartera</h3>
      <p className="text-xs mb-3" style={{ color: C.muted }}>Distribución de todos los créditos</p>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={items} dataKey="value" nameKey="label" cx="50%" cy="50%"
            innerRadius={62} outerRadius={88} paddingAngle={2} strokeWidth={0}>
            {items.map((item) => <Cell key={item.label} fill={item.color} opacity={0.9} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}`, '']} cursor={false} />
          <DonutCenter total={total} label="créditos" />
        </PieChart>
      </ResponsiveContainer>
      <DonutLegend items={items} />
    </div>
  )
}

// ── Chart 2: Pagos del Mes (donut) ────────────────────────────────────────────
export interface MonthPaymentsData { pagados: number; vencidos: number; porCobrar: number }

export function MonthPaymentsChart({ data }: { data: MonthPaymentsData }) {
  const items = [
    { label: 'Pagados',    color: C.emerald, value: data.pagados   },
    { label: 'Vencidos',   color: C.red,     value: data.vencidos  },
    { label: 'Por cobrar', color: C.amber,   value: data.porCobrar },
  ].filter((i) => i.value > 0)
  const total = items.reduce((s, i) => s + i.value, 0)
  if (total === 0) return <EmptyChart title="Pagos del Mes" subtitle="Calendario de cobros del mes en curso" />

  return (
    <div>
      <h3 className="text-sm font-semibold mb-1" style={{ color: C.fg }}>Pagos del Mes</h3>
      <p className="text-xs mb-3" style={{ color: C.muted }}>Calendario de cobros del mes en curso</p>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={items} dataKey="value" nameKey="label" cx="50%" cy="50%"
            innerRadius={62} outerRadius={88} paddingAngle={2} strokeWidth={0}>
            {items.map((item) => <Cell key={item.label} fill={item.color} opacity={0.9} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} pagos`, '']} cursor={false} />
          <DonutCenter total={total} label="pagos" />
        </PieChart>
      </ResponsiveContainer>
      <DonutLegend items={items} />
    </div>
  )
}

// ── Chart 3: Créditos activos por tipo (barra horizontal) ─────────────────────
export interface LoanTypeData { tipo: string; count: number }

const TIPO_META: Record<string, { label: string; color: string }> = {
  SOLIDARIO:  { label: 'Solidario',  color: C.purple  },
  INDIVIDUAL: { label: 'Individual', color: C.emerald },
  AGIL:       { label: 'Ágil',       color: C.amber   },
  FIDUCIARIO: { label: 'Fiduciario', color: C.blue    },
}

export function LoanTypeChart({ data }: { data: LoanTypeData[] }) {
  const items = data
    .filter((d) => d.count > 0)
    .map((d) => ({ name: TIPO_META[d.tipo]?.label ?? d.tipo, value: d.count, color: TIPO_META[d.tipo]?.color ?? C.slate }))
  if (items.length === 0) return <EmptyChart title="Créditos por Producto" subtitle="Créditos activos por tipo de crédito" />

  return (
    <div>
      <h3 className="text-sm font-semibold mb-1" style={{ color: C.fg }}>Créditos por Producto</h3>
      <p className="text-xs mb-3" style={{ color: C.muted }}>Créditos activos por tipo de crédito</p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={items} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke={C.border} strokeDasharray="3 3" />
          <XAxis type="number" tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={72} tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} créditos`, '']} cursor={{ fill: C.border, opacity: 0.4 }} />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={22}>
            {items.map((item) => <Cell key={item.name} fill={item.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Chart 4: Capital activo por sucursal (barra horizontal) ──────────────────
export interface BranchCapitalData { nombre: string; capital: number; count: number }

function fmtK(v: number | string) {
  const n = Number(v)
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`
  return `$${n}`
}

export function BranchCapitalChart({ data }: { data: BranchCapitalData[] }) {
  const items = data
    .filter((d) => d.capital > 0 || d.count > 0)
    .map((d) => ({
      name:     d.nombre.length > 13 ? d.nombre.slice(0, 13) + '…' : d.nombre,
      fullName: d.nombre,
      capital:  d.capital,
      count:    d.count,
    }))
  if (items.length === 0) return <EmptyChart title="Capital por Sucursal" subtitle="Capital activo distribuido por sucursal" />

  return (
    <div>
      <h3 className="text-sm font-semibold mb-1" style={{ color: C.fg }}>Capital por Sucursal</h3>
      <p className="text-xs mb-3" style={{ color: C.muted }}>Capital activo distribuido por sucursal</p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={items} layout="vertical" margin={{ left: 8, right: 36, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke={C.border} strokeDasharray="3 3" />
          <XAxis type="number" tickFormatter={fmtK} tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={82} tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v, _n, props) => [`${fmtK(Number(v))} · ${(props.payload as BranchCapitalData & { fullName: string })?.count ?? ''} créditos`, (props.payload as BranchCapitalData & { fullName: string })?.fullName ?? '']}
            cursor={{ fill: C.border, opacity: 0.4 }}
          />
          <Bar dataKey="capital" fill={C.indigo} radius={[0, 6, 6, 0]} maxBarSize={22} opacity={0.85} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
