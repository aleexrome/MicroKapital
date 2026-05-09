import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import type { LoanEnLimbo } from '@/lib/limbo-status'

interface Props {
  prestamosEnLimbo: LoanEnLimbo[]
}

/**
 * Banner rojo que se muestra en el dashboard cuando la cobradora tiene
 * préstamos en limbo > 72h. Lista los clientes y horas estancadas.
 * Comunica el bloqueo de "Nueva solicitud" / "Renovación anticipada".
 */
export function BannerLimbo({ prestamosEnLimbo }: Props) {
  if (prestamosEnLimbo.length === 0) return null

  return (
    <div
      className="rounded-xl border border-red-500/40 bg-red-500/10 px-5 py-4 space-y-3"
      style={{ boxShadow: '0 0 0 1px rgba(220,38,38,0.15)' }}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-red-600 dark:text-red-400">
            Tienes {prestamosEnLimbo.length} préstamo{prestamosEnLimbo.length !== 1 ? 's' : ''} pendientes de activar desde hace más de 72 horas
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            No podrás crear nuevas solicitudes ni renovaciones hasta que actives o canceles estos préstamos.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {prestamosEnLimbo.map((p) => (
          <Link
            key={p.id}
            href={`/prestamos/${p.id}`}
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-xs text-red-600 dark:text-red-300 font-medium transition-colors"
          >
            <span>{p.clienteNombre}</span>
            <span className="text-[10px] text-red-700/70 dark:text-red-300/70">{p.horasEnLimbo}h</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
