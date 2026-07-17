'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Pencil, Loader2, X } from 'lucide-react'

interface Props {
  loanId: string
  clienteNombre: string
  initialNota: string | null
}

/**
 * Botón lápiz + modal para editar `Loan.revisionNotasGenerales` desde
 * el reporte semanal de MC. Permite ajustar observaciones antes de
 * imprimir, sin salir de la vista de reporte.
 */
export function EditarNotaMCButton({ loanId, clienteNombre, initialNota }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [nota, setNota] = useState(initialNota ?? '')
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    try {
      const res = await fetch(`/api/loans/${loanId}/mc-note`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notas: nota }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Error al guardar')
      }
      toast({ title: 'Observación actualizada' })
      setOpen(false)
      router.refresh()
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'No se pudo guardar',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Editar observación de MC"
        className="rounded p-1 text-muted-foreground hover:bg-primary-500/10 hover:text-primary-400"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !saving && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Observación de MC</h2>
                <p className="text-xs text-muted-foreground">{clienteNombre}</p>
              </div>
              <button
                type="button"
                onClick={() => !saving && setOpen(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Nota general (se muestra en el reporte imprimible)
            </label>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              maxLength={2000}
              rows={5}
              placeholder="Observaciones que quieres que aparezcan en el reporte..."
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
            />
            <p className="text-[11px] text-muted-foreground mt-1 text-right">{nota.length}/2000</p>

            <div className="flex justify-end gap-2 mt-4">
              <Button type="button" variant="ghost" onClick={() => !saving && setOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="button" onClick={submit} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
