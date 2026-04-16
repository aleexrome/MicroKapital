'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Zap, Loader2, CalendarDays, ShieldCheck } from 'lucide-react'

interface LoanActivateButtonProps {
  loanId: string
  // If true, this is a gerente verifying a pending seguro transfer
  seguroPendiente?: boolean
  // Fechas pre-definidas por el Director General en la contrapropuesta
  fechaDesembolsoDG?: string | null
  fechaPrimerPagoDG?: string | null
}

export function LoanActivateButton({
  loanId,
  seguroPendiente = false,
  fechaDesembolsoDG,
  fechaPrimerPagoDG,
}: LoanActivateButtonProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [fecha, setFecha] = useState(() => fechaDesembolsoDG ?? new Date().toISOString().slice(0, 10))
  const [seguro, setSeguro] = useState('')
  const [seguroMetodo, setSeguroMetodo] = useState<'CASH' | 'TRANSFER'>('CASH')

  async function handleActivate() {
    setLoading(true)
    try {
      const body: Record<string, unknown> = { fechaDesembolso: fecha }

      if (!seguroPendiente) {
        // Normal activation: include seguro info
        const seguroNum = parseFloat(seguro) || 0
        if (seguroNum > 0) {
          body.seguro = seguroNum
          body.seguroMetodoPago = seguroMetodo
        }
      }

      const res = await fetch(`/api/loans/${loanId}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al activar')

      if (data.seguroPendiente) {
        toast({
          title: '⏳ Seguro registrado',
          description: 'Se notificó al gerente para verificar la transferencia y activar el crédito.',
        })
      } else {
        toast({ title: '✅ Crédito activado', description: 'El calendario de pagos fue generado.' })
      }
      router.refresh()
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' })
    } finally {
      setLoading(false)
      setShowForm(false)
    }
  }

  if (seguroPendiente) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-amber-700 font-medium flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4" />
          Seguro pagado por transferencia — pendiente de verificación
        </p>
        <Button
          size="sm"
          className="bg-green-600 hover:bg-green-700 text-white"
          disabled={loading}
          onClick={handleActivate}
        >
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <><ShieldCheck className="h-4 w-4 mr-1" />Verificar y activar</>}
        </Button>
      </div>
    )
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
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
      <p className="text-sm font-semibold text-blue-800 flex items-center gap-1.5">
        <Zap className="h-4 w-4" /> Activar crédito
      </p>

      {/* Fecha de desembolso */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground flex items-center gap-1">
          <CalendarDays className="h-3 w-3" /> Fecha de desembolso
        </label>
        {fechaDesembolsoDG ? (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{fechaDesembolsoDG}</span>
            <span className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded px-2 py-0.5">
              Fijada por el Director General
            </span>
          </div>
        ) : (
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm w-48"
          />
        )}
      </div>

      {/* Fecha del primer pago (si el DG la fijó) */}
      {fechaPrimerPagoDG && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground flex items-center gap-1">
            <CalendarDays className="h-3 w-3" /> Fecha del primer pago
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{fechaPrimerPagoDG}</span>
            <span className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded px-2 py-0.5">
              Fijada por el Director General
            </span>
          </div>
        </div>
      )}

      {/* Seguro de apertura */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <ShieldCheck className="h-3 w-3" /> Seguro de apertura (dejar en 0 si no aplica)
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Monto</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={seguro}
              onChange={(e) => setSeguro(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm w-32"
            />
          </div>
          {parseFloat(seguro) > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Método de pago</label>
              <select
                value={seguroMetodo}
                onChange={(e) => setSeguroMetodo(e.target.value as 'CASH' | 'TRANSFER')}
                className="border rounded px-3 py-1.5 text-sm"
              >
                <option value="CASH">Efectivo (activa de inmediato)</option>
                <option value="TRANSFER">Transferencia (espera verificación del gerente)</option>
              </select>
            </div>
          )}
        </div>
        {parseFloat(seguro) > 0 && seguroMetodo === 'TRANSFER' && (
          <p className="text-xs text-amber-600">
            ⚠️ El crédito quedará en espera hasta que el gerente verifique la transferencia del seguro.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 text-white"
          disabled={loading}
          onClick={handleActivate}
        >
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <><Zap className="h-4 w-4 mr-1" />Confirmar activación</>}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
      </div>
    </div>
  )
}
