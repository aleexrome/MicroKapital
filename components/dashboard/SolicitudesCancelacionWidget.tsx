'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ClipboardCheck, Loader2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { formatMoney } from '@/lib/utils'

export interface SolicitudPendiente {
  id: string
  loanId: string
  motivo: string
  createdAt: string
  loan: {
    estado: string
    capital: number
    aprobadoAt: string | null
    cliente: string
    cobrador: string
    branch: string
  }
  solicitanteNombre: string
}

interface Props {
  solicitudes: SolicitudPendiente[]
}

function tiempoRelativo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.round(ms / 60000)
  if (min < 60) return `hace ${min} min`
  const hr = Math.round(min / 60)
  if (hr < 24) return `hace ${hr} h`
  return `hace ${Math.round(hr / 24)} d`
}

export function SolicitudesCancelacionWidget({ solicitudes: initialSolicitudes }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [solicitudes, setSolicitudes] = useState(initialSolicitudes)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [decision, setDecision] = useState<'APROBADA' | 'RECHAZADA' | null>(null)
  const [comentario, setComentario] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function startDecision(id: string, dec: 'APROBADA' | 'RECHAZADA') {
    setActiveId(id)
    setDecision(dec)
    setComentario('')
  }

  function cancelDecision() {
    setActiveId(null)
    setDecision(null)
    setComentario('')
  }

  async function submitDecision(loanId: string) {
    if (!decision || comentario.trim().length < 3) {
      toast({ title: 'Comentario requerido', description: 'Mínimo 3 caracteres', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/loans/${loanId}/decidir-cancelacion-limbo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, comentario: comentario.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Error')
      }
      toast({ title: decision === 'APROBADA' ? 'Cancelación aprobada' : 'Solicitud rechazada' })
      setSolicitudes((prev) => prev.filter((s) => s.loanId !== loanId))
      cancelDecision()
      router.refresh()
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  if (solicitudes.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          Solicitudes de cancelación
        </h3>
        <p className="text-xs text-muted-foreground">Sin solicitudes pendientes de aprobación. ✨</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-amber-500" />
        Solicitudes de cancelación pendientes
        <span className="text-xs font-normal text-muted-foreground">({solicitudes.length})</span>
      </h3>

      <div className="space-y-2 max-h-[480px] overflow-y-auto">
        {solicitudes.map((s) => {
          const isActive = activeId === s.id
          return (
            <div
              key={s.id}
              className={`rounded-lg border ${isActive ? 'border-amber-500/60 bg-amber-500/5' : 'border-border/60 bg-background/50'} p-3 space-y-2`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/prestamos/${s.loanId}`}
                    className="text-sm font-medium hover:underline truncate block"
                  >
                    {s.loan.cliente}
                  </Link>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {s.loan.cobrador} · {s.loan.branch} · {formatMoney(s.loan.capital)} · {s.loan.estado}
                  </p>
                  <p className="text-[10px] text-muted-foreground/80">
                    Solicitado por <strong>{s.solicitanteNombre}</strong> {tiempoRelativo(s.createdAt)}
                  </p>
                </div>
              </div>
              <p className="text-xs text-foreground/80 italic border-l-2 border-amber-500/50 pl-2">
                {s.motivo}
              </p>

              {!isActive ? (
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 px-3 text-xs"
                    onClick={() => startDecision(s.id, 'APROBADA')}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Aprobar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-500/40 text-red-600 hover:bg-red-500/10 h-7 px-3 text-xs"
                    onClick={() => startDecision(s.id, 'RECHAZADA')}
                  >
                    <X className="h-3.5 w-3.5" />
                    Rechazar
                  </Button>
                </div>
              ) : (
                <div className="space-y-2 pt-1">
                  <textarea
                    autoFocus
                    value={comentario}
                    onChange={(e) => setComentario(e.target.value)}
                    placeholder={
                      decision === 'APROBADA'
                        ? 'Comentario de aprobación (visible para el solicitante)'
                        : 'Razón del rechazo (visible para el solicitante)'
                    }
                    className="w-full text-xs rounded-md border border-border bg-background px-2 py-1.5 resize-none focus:outline-none focus:border-foreground/40"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className={`h-7 px-3 text-xs ${decision === 'APROBADA' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'} text-white`}
                      disabled={submitting || comentario.trim().length < 3}
                      onClick={() => submitDecision(s.loanId)}
                    >
                      {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Confirmar {decision === 'APROBADA' ? 'aprobación' : 'rechazo'}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-3 text-xs" onClick={cancelDecision} disabled={submitting}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
