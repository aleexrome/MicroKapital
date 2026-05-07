'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, AlertOctagon, X } from 'lucide-react'

interface CancelarActivacionDialogProps {
  loanId: string
  open: boolean
  onClose: () => void
}

/**
 * Modal para cancelar el flujo de activación en curso. Llama a
 * /api/loans/[id]/cancel-activation con la razón.
 *
 * El endpoint marca el préstamo como DECLINED y deshace los efectos:
 *   - Borra el contrato firmado si está subido
 *   - Cancela el Payment de comisión si está registrado
 *   - Reverte caja / anula ticket
 */
export function CancelarActivacionDialog({
  loanId,
  open,
  onClose,
}: CancelarActivacionDialogProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  if (!open) return null

  const reasonOk = reason.trim().length >= 3

  async function handleConfirm() {
    if (!reasonOk) return
    setLoading(true)
    try {
      const res = await fetch(`/api/loans/${loanId}/cancel-activation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Error al cancelar')
      }
      toast({
        title: 'Activación cancelada',
        description: 'El préstamo quedó marcado como cancelado.',
      })
      setReason('')
      onClose()
      router.refresh()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  function handleClose() {
    if (loading) return
    setReason('')
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
            <AlertOctagon className="h-5 w-5 text-red-500" />
            <h3 className="text-base font-semibold">Cancelar activación</h3>
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
          Esto cancela el proceso de activación. Si hay un contrato firmado o un pago
          de comisión registrados, se eliminarán/cancelarán automáticamente. El
          préstamo pasará a estado <strong>Cancelado</strong> y no podrá activarse de nuevo.
        </p>

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="cancel-reason">
            Razón de la cancelación
          </label>
          <textarea
            id="cancel-reason"
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej. Cliente cambió de opinión / no se presentó a firmar / problema con el aval"
            className="w-full border border-gray-600 bg-gray-800 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
            disabled={loading}
          />
          {!reasonOk && reason.length > 0 && (
            <p className="text-xs text-amber-400">Mínimo 3 caracteres.</p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            No cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!reasonOk || loading}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Sí, cancelar activación
          </Button>
        </div>
      </div>
    </div>
  )
}
