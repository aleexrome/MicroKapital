'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Pencil, Check, X } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface Props {
  loanId: string
  fechaActual: Date | string | null
}

/**
 * Celda editable inline para la fecha del primer pago del crédito.
 * Al guardar dispara PATCH /api/loans/[id]/primer-pago que también
 * regenera el calendario si el préstamo ya tiene schedules (siempre
 * que no haya pagos capturados). Uso pensado para /reportes/aprobaciones.
 */
export function EditableFechaPrimerPago({ loanId, fechaActual }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState<string>(() => toYMD(fechaActual))
  const [pending, startTransition] = useTransition()

  const displayLabel = fechaActual
    ? <span className="text-muted-foreground">{formatDate(fechaActual)}</span>
    : <span className="text-amber-500 font-medium">⚠ Falta</span>

  function handleSave() {
    if (!value) return
    startTransition(async () => {
      try {
        const res = await fetch(`/api/loans/${loanId}/primer-pago`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fechaPrimerPago: value }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data.error ?? `Error ${res.status}`)
        }
        toast({ title: 'Fecha actualizada', description: data.message ?? '' })
        setEditing(false)
        router.refresh()
      } catch (err) {
        toast({
          title: 'Error',
          description: err instanceof Error ? err.message : 'Error',
          variant: 'destructive',
        })
      }
    })
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); setEditing(true) }}
        className="inline-flex items-center gap-1 text-xs hover:bg-secondary/50 rounded px-1 py-0.5 -mx-1 group"
        title="Editar fecha del primer pago"
      >
        {displayLabel}
        <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 text-muted-foreground" />
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="date"
        value={value}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave()
          if (e.key === 'Escape') setEditing(false)
        }}
        className="rounded border border-input bg-background px-1.5 py-0.5 text-xs h-7"
        autoFocus
      />
      <button
        type="button"
        disabled={pending || !value}
        onClick={handleSave}
        className="rounded p-1 text-emerald-500 hover:bg-emerald-500/10 disabled:opacity-40"
        title="Guardar"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => { setValue(toYMD(fechaActual)); setEditing(false) }}
        className="rounded p-1 text-muted-foreground hover:bg-secondary disabled:opacity-40"
        title="Cancelar"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function toYMD(fecha: Date | string | null): string {
  if (!fecha) return ''
  const d = typeof fecha === 'string' ? new Date(fecha) : fecha
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
