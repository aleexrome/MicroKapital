'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { CheckCircle, Loader2, Undo2 } from 'lucide-react'
import { formatMoney } from '@/lib/utils'

interface Props {
  loanId: string
  capital: number
}

/**
 * Acciones que Mesa de Control ve cuando abre una solicitud en
 * PENDING_REVIEW. Puede:
 *  - Ajustar el capital antes de forwardear (opcional, si viene el mismo
 *    no se recalcula nada).
 *  - Enviar a Dirección General → PENDING_APPROVAL.
 *  - Regresar al coordinador con observaciones → RETURNED_TO_COORDINATOR.
 */
export function MesaControlActions({ loanId, capital }: Props) {
  const router = useRouter()
  const { toast } = useToast()

  const [modoRegresar, setModoRegresar] = useState(false)
  const [modoForward, setModoForward] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [notasRegresar, setNotasRegresar] = useState('')
  const [notasForward, setNotasForward] = useState('')
  const [capitalNuevo, setCapitalNuevo] = useState<string>(String(capital))

  async function forwardToDg() {
    setProcessing(true)
    try {
      const capitalNum = Number(capitalNuevo)
      const body: Record<string, unknown> = {}
      if (notasForward.trim()) body.notas = notasForward.trim()
      if (Number.isFinite(capitalNum) && capitalNum > 0 && capitalNum !== capital) {
        body.capital = capitalNum
      }
      const res = await fetch(`/api/loans/${loanId}/forward-to-dg`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.notas?.[0] ?? data.error ?? 'Error al enviar')
      toast({ title: 'Enviada a Dirección General', description: 'La solicitud ya aparece en la bandeja de aprobaciones.' })
      router.refresh()
      setModoForward(false)
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'No se pudo enviar', variant: 'destructive' })
    } finally {
      setProcessing(false)
    }
  }

  async function returnToCoordinator() {
    if (!notasRegresar.trim()) {
      toast({ title: 'Falta redactar', description: 'Explica al coordinador qué debe subsanar.', variant: 'destructive' })
      return
    }
    setProcessing(true)
    try {
      const res = await fetch(`/api/loans/${loanId}/return-to-coordinator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notas: notasRegresar.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.notas?.[0] ?? data.error ?? 'Error al regresar')
      toast({ title: 'Solicitud regresada', description: 'El coordinador recibió las observaciones.' })
      router.refresh()
      setModoRegresar(false)
      setNotasRegresar('')
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'No se pudo regresar', variant: 'destructive' })
    } finally {
      setProcessing(false)
    }
  }

  if (modoRegresar) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
        <p className="text-sm font-semibold text-amber-900">Regresar al coordinador</p>
        <textarea
          value={notasRegresar}
          onChange={(e) => setNotasRegresar(e.target.value)}
          rows={4}
          maxLength={4000}
          placeholder="Redacta las observaciones — el coordinador las verá al abrir la solicitud."
          className="w-full rounded border border-amber-300 px-3 py-2 text-sm"
          autoFocus
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="destructive"
            disabled={processing}
            onClick={returnToCoordinator}
          >
            {processing ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Undo2 className="h-4 w-4" /> Regresar solicitud</>}
          </Button>
          <Button size="sm" variant="outline" disabled={processing} onClick={() => setModoRegresar(false)}>
            Cancelar
          </Button>
        </div>
      </div>
    )
  }

  if (modoForward) {
    return (
      <div className="rounded-xl border border-blue-300 bg-blue-50 p-4 space-y-3">
        <p className="text-sm font-semibold text-blue-900">Enviar a Dirección General</p>
        <div className="text-sm space-y-1">
          <label className="block text-blue-900 font-medium">Capital final</label>
          <input
            type="number"
            step="0.01"
            min="1"
            value={capitalNuevo}
            onChange={(e) => setCapitalNuevo(e.target.value)}
            className="w-full rounded border border-blue-300 px-3 py-2 text-sm"
          />
          <p className="text-xs text-blue-800">
            Original: <span className="money">{formatMoney(capital)}</span>. Si cambias el monto se
            recalculan comisión, pago y plazo con la fórmula del producto.
          </p>
        </div>
        <textarea
          value={notasForward}
          onChange={(e) => setNotasForward(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Notas para el DG (opcional)"
          className="w-full rounded border border-blue-300 px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="success"
            disabled={processing}
            onClick={forwardToDg}
          >
            {processing ? <Loader2 className="h-3 w-3 animate-spin" /> : <><CheckCircle className="h-4 w-4" /> Enviar a DG</>}
          </Button>
          <Button size="sm" variant="outline" disabled={processing} onClick={() => setModoForward(false)}>
            Cancelar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="pt-1 flex flex-wrap gap-2">
      <Button size="sm" variant="success" onClick={() => setModoForward(true)}>
        <CheckCircle className="h-4 w-4" /> Enviar a Dirección General
      </Button>
      <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => setModoRegresar(true)}>
        <Undo2 className="h-4 w-4" /> Regresar al coordinador
      </Button>
    </div>
  )
}
