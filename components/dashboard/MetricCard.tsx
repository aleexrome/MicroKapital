import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface MetricCardProps {
  title: string
  value: string
  description?: string
  icon: LucideIcon
  trend?: { value: number; label: string }
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple'
  className?: string
}

const colorMap = {
  blue: { bg: 'bg-blue-50', icon: 'bg-blue-100 text-blue-600', text: 'text-blue-900' },
  green: { bg: 'bg-green-50', icon: 'bg-green-100 text-green-600', text: 'text-green-900' },
  yellow: { bg: 'bg-yellow-50', icon: 'bg-yellow-100 text-yellow-600', text: 'text-yellow-900' },
  red: { bg: 'bg-red-50', icon: 'bg-red-100 text-red-600', text: 'text-red-900' },
  purple: { bg: 'bg-purple-50', icon: 'bg-purple-100 text-purple-600', text: 'text-purple-900' },
}

export function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  color = 'blue',
  className,
}: MetricCardProps) {
  const colors = colorMap[color]

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground font-medium">{title}</p>
            <p className={cn('text-2xl font-bold mt-1 money', colors.text)}>{value}</p>
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
            {trend && (
              <div
                className={cn(
                  'flex items-center gap-1 mt-2 text-xs font-medium',
                  trend.value >= 0 ? 'text-green-600' : 'text-red-600'
                )}
              >
                <span>{trend.value >= 0 ? '↑' : '↓'}</span>
                <span>
                  {Math.abs(trend.value)}% {trend.label}
                </span>
              </div>
            )}
          </div>
          <div className={cn('rounded-xl p-3', colors.icon)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
