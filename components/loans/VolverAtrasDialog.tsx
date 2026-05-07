'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Undo2, X } from 'lucide-react'

interface VolverAtrasDialogProps {
  loanId: string
  open: boolean
  onClose: () => void
}

/**
 * Modal de confirmación para "Volver atrás" — deshace la transición
 * APPROVED → IN_ACTIVATION cuando aún no se ha cumplido ningún candado.
 *
 * No pide razón (a diferencia de CancelarActivacionDialog que va a
 * DECLINED), porque no hubo avance que documentar — fue solo el botón
 * presionado por error o el cliente quiere posponer la decisión.
 */
export function VolverAtrasDialog({
  loanId,
  open,
  onClose,
}: VolverAtrasDialogProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  if (!open) return null

  async function handleConfirm() {
    setLoading(true)
    try {
      const res = await fetch(`/api/loans/${loanId}/cancel-start-activation`, {
        method: 'POST',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Error')
      }
      toast({
        title: 'Préstamo de regreso a aprobado',
        description: 'Puedes volver a iniciar la activación cuando el cliente esté listo.',
      })
      onClose()
      router.refresh()
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Error',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  function handleClose() {
    if (loading) return
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-card border border-border/60 shadow-card p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Undo2 className="h-5 w-5 text-amber-500" />
            <h3 className="text-base font-semibold">Volver atrás</h3>
          </div>
          <button
            onClick={handleClose}
            disabled={loading}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground">
          ¿Seguro que quieres volver atrás? El préstamo regresará al estado de
          <strong> Aprobado</strong>. Podrás iniciar la activación de nuevo cuando
          el cliente esté listo.
        </p>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            No, cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Sí, volver atrás
          </Button>
        </div>
      </div>
    </div>
  )
}
