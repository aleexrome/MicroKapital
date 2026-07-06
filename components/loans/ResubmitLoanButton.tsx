'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Send, Loader2 } from 'lucide-react'

export function ResubmitLoanButton({ loanId }: { loanId: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const [processing, setProcessing] = useState(false)

  async function resubmit() {
    if (!confirm('¿Reenviar la solicitud a Mesa de Control? Se limpiarán las observaciones anteriores.')) return
    setProcessing(true)
    try {
      const res = await fetch(`/api/loans/${loanId}/resubmit`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al reenviar')
      toast({ title: 'Solicitud reenviada', description: 'Mesa de Control la revisará nuevamente.' })
      router.refresh()
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'No se pudo reenviar', variant: 'destructive' })
    } finally {
      setProcessing(false)
    }
  }

  return (
    <Button size="sm" variant="success" disabled={processing} onClick={resubmit}>
      {processing ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Send className="h-4 w-4" /> Reenviar a Mesa de Control</>}
    </Button>
  )
}
