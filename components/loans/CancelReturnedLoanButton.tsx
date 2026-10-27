'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Trash2, X } from 'lucide-react'

/**
 * Botón para que coord/gerente cancele (hard-delete) una solicitud que
 * Mesa de Control le regresó, cuando el cliente desistió. Confirma con
 * modal pidiendo motivo.
 */
export function CancelReturnedLoanButton({ loanId, clienteNombre }: { loanId: string; clienteNombre: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [motivo, setMotivo] = useState('')

  async function cancelar() {
    if (motivo.trim().length < 3) {
      toast({ title: 'Motivo requerido', description: 'Dinos por qué se cancela (ej. "El cliente desistió")', variant: 'destructive' })
      return
    }
    setCargando(true)
    try {
      const r = await fetch(`/api/loans/${loanId}/cancel-returned`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: motivo.trim() }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error ?? `Error ${r.status}`)
      toast({ title: '✅ Solicitud cancelada', description: 'El expediente se eliminó.' })
      router.push('/prestamos')
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
      setCargando(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="border-red-500/40 text-red-500 hover:bg-red-500/10"
      >
        <Trash2 className="h-3.5 w-3.5" /> Cancelar solicitud
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !cargando && setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-card border border-border/60 shadow-xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <h3 className="text-base font-semibold">Cancelar solicitud</h3>
              <button onClick={() => !cargando && setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              Esta acción <strong>elimina el expediente completo</strong> de <strong>{clienteNombre}</strong>. No se puede
              deshacer. Úsala solo cuando el cliente ya no quiera continuar.
            </p>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Motivo</label>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder='Ej. "El cliente desistió", "No tiene aval", "Nunca regresó"'
                rows={3}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none"
                disabled={cargando}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={cargando}>Cancelar</Button>
              <Button variant="destructive" onClick={cancelar} disabled={motivo.trim().length < 3 || cargando}>
                {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Sí, eliminar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
