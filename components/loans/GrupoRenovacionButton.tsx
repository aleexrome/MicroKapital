'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, RefreshCw, X, AlertCircle } from 'lucide-react'
import { formatMoney } from '@/lib/utils'

interface PagoPendiente {
  id:            string
  numeroPago:    number
  montoEsperado: number
}

interface Integrante {
  loanId:         string
  clientNombre:   string
  capitalAnterior: number
  pagosRealizados: number
  umbral:          number
  pagosPendientes: PagoPendiente[]
  elegible:        boolean
  razonBloqueo:    string | null
}

interface RenewInfo {
  groupNombre:    string
  integrantes:    Integrante[]
  todosElegibles: boolean
}

/**
 * Botón para que la coordinadora solicite la renovación anticipada de
 * TODOS los integrantes de un grupo solidario en una sola operación.
 * Regla "todas o ninguna" — si al menos un integrante no es elegible,
 * se bloquea el envío (y se muestra el motivo por fila).
 */
export function GrupoRenovacionButton({ groupId }: { groupId: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [info, setInfo] = useState<RenewInfo | null>(null)

  // Estado del formulario por integrante
  const [capitales, setCapitales] = useState<Record<string, string>>({})
  const [pagosSel, setPagosSel]   = useState<Record<string, Set<string>>>({})
  const [notas, setNotas] = useState('')

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch(`/api/loan-groups/${groupId}/renew-info`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setInfo(d)
        // Pre-llenar capitales con el anterior y pagosSel vacíos.
        const caps: Record<string, string> = {}
        const sel:  Record<string, Set<string>> = {}
        for (const i of d.integrantes as Integrante[]) {
          caps[i.loanId] = i.capitalAnterior.toString()
          sel[i.loanId]  = new Set()
        }
        setCapitales(caps)
        setPagosSel(sel)
      })
      .catch((e) => {
        toast({ title: 'Error', description: e.message, variant: 'destructive' })
        setOpen(false)
      })
      .finally(() => setLoading(false))
  }, [open, groupId, toast])

  function togglePago(loanId: string, pagoId: string) {
    setPagosSel((prev) => {
      const curr = new Set(prev[loanId] ?? [])
      if (curr.has(pagoId)) curr.delete(pagoId)
      else curr.add(pagoId)
      return { ...prev, [loanId]: curr }
    })
  }

  async function enviar() {
    if (!info) return
    for (const i of info.integrantes) {
      const cap = Number(capitales[i.loanId])
      if (!cap || cap <= 0) {
        toast({ title: 'Capital requerido', description: `Falta capital para ${i.clientNombre}`, variant: 'destructive' })
        return
      }
    }
    setSending(true)
    try {
      const r = await fetch(`/api/loan-groups/${groupId}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notas: notas.trim() || undefined,
          items: info.integrantes.map((i) => ({
            loanId:              i.loanId,
            capital:             Number(capitales[i.loanId]),
            pagosFinanciadosIds: Array.from(pagosSel[i.loanId] ?? []),
          })),
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error ?? `Error ${r.status}`)
      toast({ title: '✅ Renovación grupal creada', description: d.message })
      setOpen(false)
      router.refresh()
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
    } finally { setSending(false) }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs px-2 border-green-500/40 text-green-700 hover:bg-green-50"
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
      >
        <RefreshCw className="h-3 w-3 mr-1" /> Renovar grupo
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !sending && setOpen(false)}>
          <div className="w-full max-w-3xl rounded-2xl bg-card border border-border/60 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <RefreshCw className="h-5 w-5 text-green-600" />
                    Renovación anticipada grupal
                  </h3>
                  {info && <p className="text-sm text-muted-foreground">{info.groupNombre}</p>}
                </div>
                <button onClick={() => !sending && setOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {loading && (
                <div className="py-10 flex items-center justify-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando integrantes...
                </div>
              )}

              {info && !loading && (
                <>
                  {!info.todosElegibles && (
                    <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200 flex gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium">No se puede renovar el grupo todavía</p>
                        <p className="text-xs">Regla todas o ninguna: todos los integrantes deben ser elegibles. Revisa los bloqueados en la tabla.</p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    {info.integrantes.map((i) => {
                      const cap = capitales[i.loanId] ?? ''
                      const sel = pagosSel[i.loanId] ?? new Set<string>()
                      const montoFinanciado = i.pagosPendientes
                        .filter((p) => sel.has(p.id))
                        .reduce((s, p) => s + p.montoEsperado, 0)
                      const capNum = Number(cap) || 0
                      const estimado = Math.max(0, capNum - montoFinanciado)

                      return (
                        <div
                          key={i.loanId}
                          className={`rounded-lg border p-3 space-y-2 ${
                            i.elegible ? 'border-border/60 bg-background/30' : 'border-red-500/40 bg-red-500/5'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div>
                              <p className="font-medium">{i.clientNombre}</p>
                              <p className="text-xs text-muted-foreground">
                                Capital anterior: {formatMoney(i.capitalAnterior)} · Pagos: {i.pagosRealizados}/{i.pagosRealizados + i.pagosPendientes.length}
                              </p>
                            </div>
                            {!i.elegible && (
                              <span className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 px-2 py-0.5 rounded">
                                {i.razonBloqueo}
                              </span>
                            )}
                          </div>

                          {i.elegible && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Capital del nuevo crédito</label>
                                <div className="flex items-center gap-1">
                                  <span className="text-sm text-muted-foreground">$</span>
                                  <input
                                    type="number"
                                    min="1"
                                    step="500"
                                    value={cap}
                                    onChange={(e) => setCapitales((prev) => ({ ...prev, [i.loanId]: e.target.value }))}
                                    disabled={sending}
                                    className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                                  />
                                </div>
                              </div>

                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Pagos pendientes a financiar</label>
                                <div className="space-y-1 rounded-md border border-border/60 bg-background p-2 max-h-32 overflow-y-auto">
                                  {i.pagosPendientes.length === 0 && (
                                    <p className="text-xs text-muted-foreground italic">Sin pagos pendientes</p>
                                  )}
                                  {i.pagosPendientes.map((p) => (
                                    <label key={p.id} className="flex items-center justify-between gap-2 text-xs cursor-pointer">
                                      <span className="flex items-center gap-2">
                                        <input
                                          type="checkbox"
                                          checked={sel.has(p.id)}
                                          onChange={() => togglePago(i.loanId, p.id)}
                                          disabled={sending}
                                        />
                                        Pago #{p.numeroPago}
                                      </span>
                                      <span className="font-medium">{formatMoney(p.montoEsperado)}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>

                              <div className="col-span-2 flex items-center justify-between gap-2 text-xs text-muted-foreground pt-1">
                                <span>Financiado: <strong className="text-orange-400">-{formatMoney(montoFinanciado)}</strong></span>
                                <span>Estimado a recibir: <strong className="text-foreground">{formatMoney(estimado)}</strong></span>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Notas (opcional, comunes al grupo)</label>
                    <textarea
                      value={notas}
                      onChange={(e) => setNotas(e.target.value)}
                      rows={2}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                      disabled={sending}
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>Cancelar</Button>
                    <Button
                      onClick={enviar}
                      disabled={!info.todosElegibles || sending}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Solicitar renovación del grupo
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
