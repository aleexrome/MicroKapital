/**
 * Barra de progreso animada para mostrar avance vs meta. Se usa en las
 * cards de cumplimiento. Server component (animación es CSS pura).
 */
interface Props {
  porcentaje: number      // 0..100+
  cumplido?: boolean
  esInverso?: boolean     // mora: real ≤ meta es bueno
  className?: string
}

export function ProgressBar({ porcentaje, cumplido = false, esInverso = false, className = '' }: Props) {
  const clamped = Math.max(0, Math.min(100, porcentaje))
  // Color según cumplimiento
  let barClass = 'bg-primary-500'
  if (esInverso) {
    barClass = cumplido ? 'bg-emerald-500' : 'bg-rose-500'
  } else if (porcentaje >= 100) {
    barClass = 'bg-emerald-500'
  } else if (porcentaje >= 75) {
    barClass = 'bg-amber-500'
  } else if (porcentaje >= 40) {
    barClass = 'bg-orange-500'
  } else {
    barClass = 'bg-rose-500'
  }

  return (
    <div className={`relative h-2 w-full overflow-hidden rounded-full bg-secondary/60 ${className}`}>
      <div
        className={`h-full ${barClass} transition-[width] duration-700 ease-out`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
