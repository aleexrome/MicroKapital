import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Target, Building2, User as UserIcon, Layers, TrendingUp, AlertCircle } from 'lucide-react'
import { formatMoney } from '@/lib/utils'
import { ProgressBar } from './ProgressBar'
import type { CumplimientoMeta, KpiCumplimiento } from '@/lib/reportes/cumplimiento'

const TIPO_LABEL: Record<string, string> = {
  SOLIDARIO:  'Solidario',
  INDIVIDUAL: 'Individual',
  AGIL:       'Ágil',
  FIDUCIARIO: 'Fiduciario',
}

function formatKpiValue(k: KpiCumplimiento, value: number): string {
  if (k.unidad === 'monto')      return formatMoney(value)
  if (k.unidad === 'porcentaje') return `${value.toFixed(1)}%`
  return value.toLocaleString('es-MX')
}

interface Props {
  cumplimiento: CumplimientoMeta
}

export function CumplimientoCard({ cumplimiento }: Props) {
  const { goal, kpis, porcentajeGlobal } = cumplimiento

  const scopeLabel: string[] = []
  if (goal.cobradorNombre) scopeLabel.push(goal.cobradorNombre)
  if (goal.branchNombre)   scopeLabel.push(goal.branchNombre)
  if (goal.loanType)       scopeLabel.push(TIPO_LABEL[goal.loanType] ?? goal.loanType)
  const titulo = scopeLabel.length === 0 ? 'Meta global · Empresa' : scopeLabel.join(' · ')

  const ScopeIcon = goal.cobradorId ? UserIcon : goal.branchId ? Building2 : goal.loanType ? Layers : Target

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="rounded-xl bg-primary-500/15 p-2 ring-1 ring-primary-500/30 shrink-0">
              <ScopeIcon className="h-4 w-4 text-primary-300" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-sm truncate">{titulo}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {kpis.length} KPI{kpis.length === 1 ? '' : 's'} definido{kpis.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-bold money tabular-nums leading-none">
              {porcentajeGlobal.toFixed(0)}%
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">
              Global
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {kpis.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground p-3 rounded-lg bg-secondary/40">
            <AlertCircle className="h-4 w-4" />
            <span>Sin KPIs definidos</span>
          </div>
        ) : (
          kpis.map((k) => (
            <div key={k.clave} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-medium text-foreground">{k.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  <span className={k.cumplido ? 'text-emerald-400 font-semibold' : 'text-foreground'}>
                    {formatKpiValue(k, k.real)}
                  </span>
                  <span className="opacity-60"> / {formatKpiValue(k, k.meta)}</span>
                </span>
              </div>
              <ProgressBar
                porcentaje={k.porcentaje}
                cumplido={k.cumplido}
                esInverso={k.esInverso}
              />
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground tabular-nums">
                  {k.porcentaje.toFixed(0)}%
                </span>
                {k.cumplido && (
                  <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] px-1.5 py-0">
                    Cumplido
                  </Badge>
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

export function CumplimientoSummary({ items }: { items: CumplimientoMeta[] }) {
  const total = items.length
  const cumplidas = items.filter((c) => c.kpis.length > 0 && c.kpis.every((k) => k.cumplido)).length
  const promedio = total > 0
    ? items.reduce((s, i) => s + i.porcentajeGlobal, 0) / total
    : 0
  return (
    <Card>
      <CardContent className="p-5">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Metas</p>
            <p className="text-2xl font-bold money tabular-nums mt-1">{total}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Cumplidas</p>
            <p className="text-2xl font-bold money tabular-nums mt-1 text-emerald-400">{cumplidas}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Promedio</p>
            <div className="flex items-center justify-center gap-1.5 mt-1">
              <p className="text-2xl font-bold money tabular-nums">{promedio.toFixed(0)}%</p>
              <TrendingUp className="h-4 w-4 text-primary-300" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
