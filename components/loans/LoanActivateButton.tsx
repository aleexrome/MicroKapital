'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Zap, Loader2, CalendarDays } from 'lucide-react'

interface LoanActivateButtonProps {
  loanId: string
}

export function LoanActivateButton({ loanId }: LoanActivateButtonProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))

  async function handleActivate() {
    setLoading(true)
    try {
      const res = await fetch(`/api/loans/${loanId}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fechaDesembolso: fecha }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al activar')
      toast({ title: '✅ Crédito activado', description: 'El calendario de pagos fue generado.' })
      router.refresh()
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' })
    } finally {
      setLoading(false)
      setShowForm(false)
    }
  }

  if (!showForm) {
    return (
      <Button size="sm" variant="default" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setShowForm(true)}>
        <Zap className="h-4 w-4 mr-1" />
        Activar crédito
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground flex items-center gap-1">
          <CalendarDays className="h-3 w-3" /> Fecha de desembolso
        </label>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm"
        />
      </div>
      <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" disabled={loading} onClick={handleActivate}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Zap className="h-4 w-4 mr-1" />Confirmar activación</>}
      </Button>
      <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
    </div>
  )
}
