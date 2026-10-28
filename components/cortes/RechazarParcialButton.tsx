'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, XCircle, X } from 'lucide-react'

/**
 * Botón para que la concentradora rechace un parcial que le entregaron
 * (ej. la foto del ticket no se ve, discrepancia de monto, falta firma,
 * sin ticket). Pide un motivo visible para el coord que entregó. Al
 * rechazar, el corte queda en RECHAZADO y el coord ve la razón y debe
 * re-entregar con la corrección.
 */
export function RechazarParcialButton({ corteId, montoEsperado }: { corteId: string; montoEsperado: number }) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [razon, setRazon] = useState('')
  const [montoRealTxt, setMontoRealTxt] = useState('')

  async function rechazar() {
    if (razon.trim().length < 3) {
      toast({ title: 'Motivo requerido', description: 'Dinos por qué rechazas (ej. "foto no se lee")', variant: 'destructive' })
      return
    }
    const montoRealRecibido = montoRealTxt.trim() ? Number(montoRealTxt) : undefined
    if (montoRealTxt.trim() && (Number.isNaN(montoRealRecibido) || montoRealRecibido! < 0)) {
      toast({ title: 'Monto inválido', variant: 'destructive' })
      return
    }
    setCargando(true)
    try {
      const r = await fetch(`/api/cortes/${corteId}/rechazar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razon: razon.trim(),
          ...(montoRealRecibido !== undefined ? { montoRealRecibido } : {}),
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error ?? `Error ${r.status}`)
      toast({ title: 'Parcial rechazado', description: 'El coord fue notificado y debe re-entregar.' })
      setOpen(false)
      router.refresh()
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
      setCargando(false)
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className="border-red-500/40 text-red-500 hover:bg-red-500/10"
      >
        <XCircle className="h-3.5 w-3.5" /> Rechazar
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !cargando && setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-card border border-border/60 shadow-xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <h3 className="text-base font-semibold">Rechazar parcial</h3>
              <button onClick={() => !cargando && setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              El coord verá el motivo y deberá re-entregar con la corrección (nueva foto o monto correcto).
            </p>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Motivo</label>
              <textarea
                value={razon}
                onChange={(e) => setRazon(e.target.value)}
                placeholder='Ej. "La foto no es del ticket", "Falta firma", "Monto no coincide"'
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                disabled={cargando}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Monto real recibido en efectivo <span className="text-muted-foreground/70">(opcional — si lo contaste y es distinto a ${montoEsperado.toFixed(2)})</span>
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={montoRealTxt}
                onChange={(e) => setMontoRealTxt(e.target.value)}
                placeholder={`${montoEsperado.toFixed(2)}`}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                disabled={cargando}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={cargando}>Cancelar</Button>
              <Button variant="destructive" onClick={rechazar} disabled={razon.trim().length < 3 || cargando}>
                {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Rechazar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
