'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, X, CheckCircle2, XCircle } from 'lucide-react'

interface Props {
  corte: {
    id: string
    numeroCorte: number
    totalAEntregar: string
    metodoEntregaFinal: 'EFECTIVO_FIRMADO' | 'TRANSFERENCIA' | null
    fotoTicketUrl: string | null
    transferenciaFotoUrl: string | null
    user?: { nombre: string }
    branch?: { nombre: string }
    consolidadoHijos?: Array<{ id: string; numeroCorte: number; totalAEntregar: string; user: { nombre: string } }>
  }
  onClose: () => void
}

export function ConfirmarConsolidadoDialog({ corte, onClose }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [procesando, setProcesando] = useState<'CONFIRMAR' | 'RECHAZAR' | null>(null)
  const [razon, setRazon] = useState('')
  const [mostrandoRechazo, setMostrandoRechazo] = useState(false)

  async function enviar(accion: 'CONFIRMAR' | 'RECHAZAR') {
    if (accion === 'RECHAZAR' && razon.trim().length < 3) {
      toast({ title: 'Razón requerida', variant: 'destructive' })
      return
    }
    setProcesando(accion)
    try {
      const r = await fetch(`/api/cortes/consolidado/${corte.id}/confirmar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion, razon: razon || undefined }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error ?? `Error ${r.status}`)
      toast({
        title: accion === 'CONFIRMAR' ? '✅ Consolidado confirmado' : '✅ Consolidado rechazado',
        description: accion === 'CONFIRMAR' ? 'Dinero recibido.' : 'Parciales liberados para re-consolidar.',
      })
      onClose()
      router.refresh()
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
    } finally { setProcesando(null) }
  }

  const fotoUrl = corte.metodoEntregaFinal === 'TRANSFERENCIA' ? corte.transferenciaFotoUrl : corte.fotoTicketUrl

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !procesando && onClose()}>
      <div className="w-full max-w-md rounded-2xl bg-card border border-border/60 shadow-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold">Confirmar consolidado</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              De {corte.user?.nombre} · {corte.branch?.nombre}
            </p>
          </div>
          <button onClick={() => !procesando && onClose()} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3">
          <div className="text-xs text-muted-foreground">Monto reportado por el sistema</div>
          <div className="text-3xl font-bold tabular-nums text-emerald-400">
            ${Number(corte.totalAEntregar).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {corte.metodoEntregaFinal === 'TRANSFERENCIA' ? '💳 Vía transferencia bancaria' : '💵 Efectivo con ticket firmado'}
          </div>
        </div>

        {corte.consolidadoHijos && corte.consolidadoHijos.length > 0 && (
          <div className="rounded-lg border border-border p-3 space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Desglose ({corte.consolidadoHijos.length} parciales)</div>
            {corte.consolidadoHijos.map((h) => (
              <div key={h.id} className="flex justify-between text-xs">
                <span>{h.user.nombre} <span className="text-muted-foreground">#{h.numeroCorte}</span></span>
                <span className="tabular-nums font-medium">${Number(h.totalAEntregar).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
              </div>
            ))}
          </div>
        )}

        {fotoUrl && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">Evidencia</div>
            <a href={fotoUrl} target="_blank" rel="noreferrer">
              <img src={fotoUrl} alt="Evidencia" className="w-full rounded-lg max-h-72 object-contain bg-black/5 border hover:border-sky-500/50 transition" />
            </a>
          </div>
        )}

        {mostrandoRechazo ? (
          <div className="space-y-2">
            <label className="text-xs font-medium text-red-400">Razón del rechazo</label>
            <textarea
              value={razon}
              onChange={(e) => setRazon(e.target.value)}
              placeholder="Ej. No llegó la transferencia, monto distinto, foto no legible…"
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none"
              disabled={!!procesando}
            />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setMostrandoRechazo(false); setRazon('') }} disabled={!!procesando}>Cancelar</Button>
              <Button variant="destructive" size="sm" onClick={() => enviar('RECHAZAR')} disabled={razon.trim().length < 3 || !!procesando}>
                {procesando === 'RECHAZAR' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                Confirmar rechazo
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1 border-red-500/40 text-red-400 hover:bg-red-500/10" onClick={() => setMostrandoRechazo(true)} disabled={!!procesando}>
              <XCircle className="h-4 w-4" /> No recibí
            </Button>
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => enviar('CONFIRMAR')} disabled={!!procesando}>
              {procesando === 'CONFIRMAR' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Confirmo recibí
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
