import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'

interface MetricCardProps {
  title: string
  value: string
  description?: string
  icon: LucideIcon
  trend?: { value: number; label: string }
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple'
  className?: string
  href?: string
}

const colorMap = {
  blue:   { iconBg: 'bg-blue-500/15',   iconText: 'text-blue-400',   valueText: 'text-blue-300' },
  green:  { iconBg: 'bg-emerald-500/15', iconText: 'text-emerald-400', valueText: 'text-emerald-300' },
  yellow: { iconBg: 'bg-amber-500/15',  iconText: 'text-amber-400',  valueText: 'text-amber-300' },
  red:    { iconBg: 'bg-rose-500/15',   iconText: 'text-rose-400',   valueText: 'text-rose-300' },
  purple: { iconBg: 'bg-violet-500/15', iconText: 'text-violet-400', valueText: 'text-violet-300' },
}

export function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  color = 'blue',
  className,
  href,
}: MetricCardProps) {
  const colors = colorMap[color]

  const inner = (
    <CardContent className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {title}
          </p>
          <p className={cn('text-2xl font-bold money leading-tight', colors.valueText)}>
            {value}
          </p>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
          {trend && (
            <div
              className={cn(
                'flex items-center gap-1 text-xs font-semibold',
                trend.value >= 0 ? 'text-emerald-400' : 'text-rose-400'
              )}
            >
              <span>{trend.value >= 0 ? '↑' : '↓'}</span>
              <span>{Math.abs(trend.value)}% {trend.label}</span>
            </div>
          )}
        </div>
        <div className={cn('rounded-xl p-3 shrink-0', colors.iconBg)}>
          <Icon className={cn('h-5 w-5', colors.iconText)} />
        </div>
      </div>
    </CardContent>
  )

  if (href) {
    return (
      <Link href={href} className="block">
        <Card className={cn('overflow-hidden border-border/50 shadow-card transition-all hover:shadow-md hover:border-border', className)}>
          {inner}
        </Card>
      </Link>
    )
  }

  return (
    <Card className={cn('overflow-hidden border-border/50 shadow-card', className)}>
      {inner}
    </Card>
  )
}
