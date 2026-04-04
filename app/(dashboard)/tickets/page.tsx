'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { formatDate, formatMoney } from '@/lib/utils'
import { Printer, Ban, RotateCcw, Loader2, Ticket } from 'lucide-react'

interface TicketRecord {
  id: string
  numeroTicket: string
  esReimpresion: boolean
  anulado: boolean
  impresoAt: string
  payment: {
    monto: string
    metodoPago: string
    client: { nombreCompleto: string }
  }
  impresoPor: { nombre: string }
}

export default function TicketsPage() {
  const { toast } = useToast()
  const [tickets, setTickets] = useState<TicketRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [voidId, setVoidId] = useState<string | null>(null)
  const [razonAnulacion, setRazonAnulacion] = useState('')

  async function loadTickets() {
    const res = await fetch('/api/tickets')
    const data = await res.json()
    setTickets(data.data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadTickets() }, [])

  async function handleReprint(ticketId: string) {
    setProcessing(ticketId)
    try {
      const res = await fetch(`/api/tickets/${ticketId}/reprint`, { method: 'POST' })
      if (!res.ok) throw new Error('Error al reimprimir')
      const { data } = await res.json()
      toast({ title: '🖨️ Reimpresión generada', description: data.numeroTicket })
      loadTickets()
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' })
    } finally {
      setProcessing(null)
    }
  }

  async function handleVoid(ticketId: string) {
    if (!razonAnulacion.trim()) return
    setProcessing(ticketId)
    try {
      const res = await fetch(`/api/tickets/${ticketId}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ razonAnulacion }),
      })
      if (!res.ok) throw new Error('Error al anular')
      toast({ title: 'Ticket anulado' })
      setVoidId(null)
      setRazonAnulacion('')
      loadTickets()
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' })
    } finally {
      setProcessing(null)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Control de tickets</h1>
        <p className="text-muted-foreground">Reimpresiones y anulaciones</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary-700" />
        </div>
      ) : tickets.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Ticket className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No hay tickets registrados</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <Card key={ticket.id} className={ticket.anulado ? 'opacity-60' : ''}>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-sm">{ticket.numeroTicket}</span>
                      {ticket.esReimpresion && <Badge variant="secondary">Reimpresión</Badge>}
                      {ticket.anulado && <Badge variant="error">Anulado</Badge>}
                    </div>
                    <p className="text-sm text-gray-700 mt-0.5">{ticket.payment.client.nombreCompleto}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatMoney(Number(ticket.payment.monto))} · {ticket.payment.metodoPago} ·{' '}
                      {formatDate(ticket.impresoAt)} · {ticket.impresoPor.nombre}
                    </p>
                  </div>

                  {!ticket.anulado && (
                    <div className="flex items-center gap-2">
                      {voidId === ticket.id ? (
                        <div className="flex gap-2 items-center">
                          <input
                            className="border rounded px-2 py-1 text-sm w-40"
                            placeholder="Razón de anulación..."
                            value={razonAnulacion}
                            onChange={(e) => setRazonAnulacion(e.target.value)}
                            autoFocus
                          />
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={!razonAnulacion.trim() || !!processing}
                            onClick={() => handleVoid(ticket.id)}
                          >
                            {processing === ticket.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Anular'}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setVoidId(null)}>Cancelar</Button>
                        </div>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!!processing}
                            onClick={() => handleReprint(ticket.id)}
                          >
                            {processing === ticket.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><RotateCcw className="h-3 w-3" /> Reimprimir</>}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-300 hover:bg-red-50"
                            onClick={() => setVoidId(ticket.id)}
                          >
                            <Ban className="h-3 w-3" /> Anular
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
