'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'

interface LoanApprovalActionsProps {
  loanId: string
}

export function LoanApprovalActions({ loanId }: LoanApprovalActionsProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [processing, setProcessing] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [razonRechazo, setRazonRechazo] = useState('')

  async function handleApprove() {
    setProcessing(true)
    try {
      const res = await fetch(`/api/loans/${loanId}/approve`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Error al aprobar')
      }
      toast({ title: '✅ Préstamo aprobado', description: 'Calendario de pagos generado' })
      router.refresh()
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' })
    } finally {
      setProcessing(false)
    }
  }

  async function handleReject() {
    if (!razonRechazo.trim()) return
    setProcessing(true)
    try {
      const res = await fetch(`/api/loans/${loanId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ razonRechazo }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Error al rechazar')
      }
      toast({ title: 'Préstamo rechazado' })
      setShowReject(false)
      setRazonRechazo('')
      router.refresh()
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' })
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="flex flex-col sm:flex-row gap-2 pt-2">
      {showReject ? (
        <div className="flex flex-col gap-2 w-full sm:max-w-sm">
          <input
            className="border rounded px-3 py-2 text-sm w-full"
            placeholder="Razón del rechazo..."
            value={razonRechazo}
            onChange={(e) => setRazonRechazo(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={!razonRechazo.trim() || processing}
              onClick={handleReject}
            >
              {processing ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirmar rechazo'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowReject(false)}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <>
          <Button size="sm" variant="success" disabled={processing} onClick={handleApprove}>
            {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle className="h-4 w-4" /> Aprobar</>}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-red-300 text-red-600 hover:bg-red-50"
            onClick={() => setShowReject(true)}
          >
            <XCircle className="h-4 w-4" /> Rechazar
          </Button>
        </>
      )}
    </div>
  )
}
