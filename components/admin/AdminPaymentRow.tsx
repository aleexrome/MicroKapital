'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Loader2 } from 'lucide-react'

const METODO_LABEL: Record<string, string> = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia' }

interface Props {
  paymentId: string
  currentMethod: string
}

export function AdminPaymentMethodSelect({ paymentId, currentMethod }: Props) {
  const { toast } = useToast()
  const [method, setMethod] = useState(currentMethod)
  const [loading, setLoading] = useState(false)

  async function handleChange(newMethod: string) {
    if (newMethod === method) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/payments/${paymentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metodoPago: newMethod }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Error')
      setMethod(newMethod)
      toast({ title: 'Método de pago actualizado' })
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      <select
        value={method}
        onChange={(e) => handleChange(e.target.value)}
        disabled={loading}
        className="border rounded px-2 py-1 text-xs"
      >
        <option value="CASH">Efectivo</option>
        <option value="CARD">Tarjeta</option>
        <option value="TRANSFER">Transferencia</option>
      </select>
      <span className="text-xs text-muted-foreground">({METODO_LABEL[method] ?? method})</span>
    </div>
  )
}
