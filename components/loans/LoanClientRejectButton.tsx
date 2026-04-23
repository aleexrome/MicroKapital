'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { UserX, Loader2 } from 'lucide-react'

interface LoanClientRejectButtonProps {
  loanId: string
}

export function LoanClientRejectButton({ loanId }: LoanClientRejectButtonProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [showConfirm, setShowConfirm] = useState(false)
  const [processing, setProcessing] = useState(false)

  async function handleClientReject() {
    setProcessing(true)
    try {
      const res = await fetch(`/api/loans/${loanId}/client-reject`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Error al registrar rechazo')
      }
      toast({ title: 'Registrado', description: 'El cliente no aceptó las condiciones. Crédito cancelado.' })
      router.refresh()
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' })
    } finally {
      setProcessing(false)
      setShowConfirm(false)
    }
  }

  if (showConfirm) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm space-y-2">
        <p className="font-semibold text-red-800">¿Confirmar que el cliente no acepta las condiciones?</p>
        <p className="text-xs text-red-700">
          El crédito quedará cancelado. Esta acción no se puede deshacer.
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="destructive"
            disabled={processing}
            onClick={handleClientReject}
          >
            {processing ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Sí, el cliente rechaza'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowConfirm(false)}>
            Cancelar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className="border-red-300 text-red-600 hover:bg-red-50"
      onClick={() => setShowConfirm(true)}
    >
      <UserX className="h-4 w-4 mr-1" />
      Cliente no acepta condiciones
    </Button>
  )
}
