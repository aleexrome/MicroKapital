import { getScoreInfo } from '@/lib/score-calculator'
import { cn } from '@/lib/utils'

interface ScoreBadgeProps {
  score: number
  showLabel?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function ScoreBadge({ score, showLabel = true, size = 'md' }: ScoreBadgeProps) {
  const info = getScoreInfo(score)

  const emoji =
    info.nivel === 'ALTO_RIESGO'
      ? '🔴'
      : info.nivel === 'RIESGO_MEDIO'
      ? '🟠'
      : info.nivel === 'REGULAR'
      ? '🟡'
      : info.nivel === 'BUEN_CLIENTE'
      ? '🟢'
      : '⭐'

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-semibold',
        size === 'sm' && 'px-2 py-0.5 text-xs',
        size === 'md' && 'px-3 py-1 text-sm',
        size === 'lg' && 'px-4 py-1.5 text-base'
      )}
      style={{ backgroundColor: info.color + '20', color: info.color }}
    >
      <span>{emoji}</span>
      <span className="tabular-nums">{score}</span>
      {showLabel && <span>{info.label}</span>}
    </div>
  )
}
