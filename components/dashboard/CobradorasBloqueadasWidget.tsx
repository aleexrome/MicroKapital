'use client'

import { Lock, User } from 'lucide-react'
import type { CobradoraBloqueada } from '@/lib/limbo-dashboard'

interface Props {
  cobradoras: CobradoraBloqueada[]
}

/**
 * Lista de cobradoras con bloqueo activo (al menos un préstamo > 72h en
 * limbo). Aparece en dashboard DG/DC para visibilidad de quiénes están
 * bloqueadas para crear nuevas solicitudes/renovaciones.
 */
export function CobradorasBloqueadasWidget({ cobradoras }: Props) {
  if (cobradoras.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Lock className="h-4 w-4 text-muted-foreground" />
          Cobradoras bloqueadas
        </h3>
        <p className="text-xs text-muted-foreground">Ninguna cobradora bloqueada actualmente. ✨</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5 space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2 text-red-600 dark:text-red-400">
        <Lock className="h-4 w-4" />
        Cobradoras bloqueadas
        <span className="text-xs font-normal text-muted-foreground">({cobradoras.length})</span>
      </h3>

      <div className="space-y-1.5 max-h-72 overflow-y-auto">
        {cobradoras.map((c) => (
          <div
            key={c.cobradorId}
            className="flex items-center justify-between gap-2 rounded-md bg-card border border-border/40 px-3 py-2 text-sm"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="font-medium truncate">{c.cobradorNombre}</p>
                <p className="text-[10px] text-muted-foreground truncate">{c.branchNombre ?? '—'}</p>
              </div>
            </div>
            <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 font-semibold">
              {c.prestamosCount} en limbo
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
