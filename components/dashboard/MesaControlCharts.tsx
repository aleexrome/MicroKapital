'use client'

import {
  PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer,
} from 'recharts'

const C = {
  emerald: '#10b981',
  amber:   '#f59e0b',
  purple:  '#7B6FFF',
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
  fontSize: 12,
  padding: '8px 10px',
}

/**
 * Barras por día de la semana (Sáb–Vie) mostrando aprobadas vs
 * regresadas apiladas. Da una lectura rápida del volumen y ritmo del
 * trabajo de MC durante la semana.
 */
export function MesaControlBarChart({
  data,
}: {
  data: Array<{ dia: string; aprobadas: number; regresadas: number }>
}) {
  const hayDatos = data.some((d) => d.aprobadas + d.regresadas > 0)
  if (!hayDatos) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">
        Sin actividad esta semana
      </div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={224}>
      <BarChart data={data} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="dia" tick={{ fill: C.muted, fontSize: 11 }} axisLine={{ stroke: C.border }} tickLine={false} />
        <YAxis tick={{ fill: C.muted, fontSize: 11 }} axisLine={{ stroke: C.border }} tickLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(123,111,255,0.06)' }} />
        <Bar dataKey="aprobadas" name="Aprobadas" stackId="a" fill={C.emerald} radius={[0, 0, 0, 0]} />
        <Bar dataKey="regresadas" name="Regresadas" stackId="a" fill={C.amber} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/**
 * Donut con el split aprobadas vs regresadas de la semana.
 */
export function MesaControlDonut({
  aprobadas, regresadas,
}: {
  aprobadas: number
  regresadas: number
}) {
  const total = aprobadas + regresadas
  const pct   = total > 0 ? Math.round((aprobadas / total) * 100) : 0
  const items = [
    { label: 'Aprobadas', value: aprobadas, color: C.emerald },
    { label: 'Regresadas', value: regresadas, color: C.amber },
  ]

  if (total === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">
        Sin revisiones esta semana
      </div>
    )
  }

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={items}
            dataKey="value"
            innerRadius={58}
            outerRadius={82}
            paddingAngle={2}
            stroke="none"
          >
            {items.map((item, i) => (
              <Cell key={i} fill={item.color} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <p className="text-3xl font-black text-foreground">{pct}%</p>
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Aprobación</p>
      </div>
      <div className="flex justify-center gap-4 mt-3 text-xs">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5 text-muted-foreground">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            <span>{item.label}</span>
            <span className="font-semibold text-foreground">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
