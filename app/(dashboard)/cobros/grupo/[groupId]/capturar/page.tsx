'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { formatMoney } from '@/lib/utils'
import {
  ArrowLeft, CheckCircle, XCircle, Users, Banknote,
  CreditCard, Building2, Loader2, Printer,
} from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { buildGroupTicketBytes, loadLogoBitmap, printViaBluetooth } from '@/lib/escpos'

const LOGO_URL = 'https://res.cloudinary.com/djs8dtzrq/image/upload/v1776487061/ddcb6871-4cff-422e-9a00-67d62aa6243f.png'

interface GroupTicketMeta {
  empresa:  string
  sucursal: string
  cobrador: string
  fecha:    string
  qrCode:   string | null
}

type PagoStatus = 'PAID' | 'COVERED' | 'UNPAID'
type Metodo = 'CASH' | 'CARD' | 'TRANSFER'

interface MiembroInfo {
  scheduleId:   string
  loanId:       string
  clientId:     string
  clientNombre: string
  numeroPago:   number
  totalPagos:   number
  monto:        number
  estadoActual: string
}

interface MiembroState {
  status:               PagoStatus
  metodoPago:           Metodo
  cubridoPorClienteId?: string
}

export default function CapturarGrupoPage() {
  const params  = useParams()
  const groupId = params.groupId as string
  const router  = useRouter()
  const { toast } = useToast()

  const [miembros, setMiembros] = useState<MiembroInfo[]>([])
  const [states,   setStates]   = useState<Record<string, MiembroState>>({})
  const [loading,  setLoading]  = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [done,     setDone]     = useState(false)
  const [tickets,  setTickets]  = useState<{ id: string; numeroTicket: string; clienteNombre: string; monto: number; esCoberturaGrupal: boolean }[]>([])
  const [grupoNombre, setGrupoNombre] = useState('')
  const [groupMeta, setGroupMeta] = useState<GroupTicketMeta | null>(null)
  const [printingGroup, setPrintingGroup] = useState(false)

  useEffect(() => {
    fetch(`/api/cobros/grupo/${groupId}/miembros`)
      .then((r) => r.json())
      .then((d) => {
        const data: MiembroInfo[] = d.data ?? []
        setMiembros(data)
        setGrupoNombre(d.grupoNombre ?? '')
        const init: Record<string, MiembroState> = {}
        data.forEach((m) => { init[m.clientId] = { status: 'PAID', metodoPago: 'CASH' } })
        setStates(init)
        setLoading(false)
      })
  }, [groupId])

  function setStatus(clientId: string, status: PagoStatus) {
    setStates((prev) => ({ ...prev, [clientId]: { ...prev[clientId], status, cubridoPorClienteId: undefined } }))
  }

  function setMetodo(clientId: string, metodoPago: Metodo) {
    setStates((prev) => ({ ...prev, [clientId]: { ...prev[clientId], metodoPago } }))
  }

  function setCubridor(clientId: string, cubridoPorClienteId: string) {
    setStates((prev) => ({ ...prev, [clientId]: { ...prev[clientId], cubridoPorClienteId } }))
  }

  const totalEsperado  = miembros.reduce((s, m) => s + m.monto, 0)
  const totalPagado    = miembros.filter((m) => states[m.clientId]?.status !== 'UNPAID').reduce((s, m) => s + m.monto, 0)
  const hayProblema    = miembros.some((m) => {
    const st = states[m.clientId]
    return st?.status === 'COVERED' && !st.cubridoPorClienteId
  })

  async function handleSubmit() {
    if (hayProblema) {
      toast({ title: 'Completa la información', description: 'Indica quién cubrió a cada integrante marcada como CUBIERTA', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    try {
      const pagos = miembros.map((m) => {
        const st = states[m.clientId]!
        return {
          scheduleId:          m.scheduleId,
          loanId:              m.loanId,
          clientId:            m.clientId,
          status:              st.status,
          metodoPago:          st.metodoPago,
          cubridoPorClienteId: st.cubridoPorClienteId,
        }
      })

      const res = await fetch(`/api/cobros/grupo/${groupId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pagos }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Error')
      const data = await res.json()
      setTickets(data.tickets)
      setGrupoNombre(data.grupoNombre)
      if (data.groupTicketMeta) setGroupMeta(data.groupTicketMeta)
      setDone(true)
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleGroupPrint() {
    if (!groupMeta) return
    setPrintingGroup(true)
    try {
      // Construir el nombre de cobertura por cliente (quién cubrió a quién)
      const nombreByClient = new Map<string, string>()
      for (const m of miembros) nombreByClient.set(m.clientId, m.clientNombre)

      const integrantes = miembros.map((m) => {
        const st = states[m.clientId]
        if (!st) return null
        if (st.status === 'UNPAID') return null
        const t = tickets.find((tk) => tk.clienteNombre === m.clientNombre)
        const monto = t ? t.monto : m.monto
        let nota: string | undefined
        if (st.status === 'COVERED' && st.cubridoPorClienteId) {
          nota = `Cubierta por ${nombreByClient.get(st.cubridoPorClienteId) ?? ''}`.trim()
        }
        return {
          cliente: m.clientNombre,
          monto:   formatMoney(monto),
          nota,
        }
      }).filter((x): x is NonNullable<typeof x> => x !== null)

      const total = tickets.reduce((s, t) => s + t.monto, 0)
      const metodos = new Set(miembros
        .filter((m) => states[m.clientId]?.status !== 'UNPAID')
        .map((m) => states[m.clientId]!.metodoPago))
      const metodoLabel = metodos.size === 1
        ? [...metodos][0] === 'CASH' ? 'Efectivo' : [...metodos][0] === 'CARD' ? 'Tarjeta' : 'Transferencia'
        : 'Mixto'

      let logo: { pixels: Uint8Array; widthPx: number; heightPx: number } | undefined
      try { logo = await loadLogoBitmap(LOGO_URL, 384) } catch { /* seguir sin logo */ }

      const fechaD = new Date(groupMeta.fecha)
      const bytes = buildGroupTicketBytes({
        empresa:     groupMeta.empresa,
        sucursal:    groupMeta.sucursal,
        fecha:       format(fechaD, 'dd/MM/yyyy'),
        hora:        format(fechaD, 'HH:mm'),
        cobrador:    groupMeta.cobrador,
        grupoNombre,
        integrantes,
        totalCobrado: formatMoney(total),
        metodoPago:   metodoLabel,
        qrCode:       groupMeta.qrCode ?? undefined,
        logo,
      })

      await printViaBluetooth(bytes)
      toast({ title: '✅ Ticket grupal enviado a la impresora' })
    } catch (err) {
      toast({
        title: 'Error Bluetooth',
        description: err instanceof Error ? err.message : 'No se pudo imprimir',
        variant: 'destructive',
      })
    } finally {
      setPrintingGroup(false)
    }
  }

  // ── RESULTADO ─────────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="p-4 max-w-sm mx-auto space-y-4">
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle className="h-6 w-6" />
          <h2 className="text-lg font-bold">¡Pagos registrados!</h2>
        </div>
        <p className="text-sm text-muted-foreground">Grupo: <strong>{grupoNombre}</strong></p>

        {/* Ticket grupal consolidado */}
        {groupMeta && tickets.length > 0 && (
          <Button
            className="w-full"
            size="lg"
            onClick={handleGroupPrint}
            disabled={printingGroup}
          >
            {printingGroup
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <><Printer className="h-4 w-4 mr-1" />Imprimir ticket grupal</>}
          </Button>
        )}

        <div className="space-y-2">
          {tickets.map((t) => (
            <Card key={t.id}>
              <CardContent className="p-3 text-sm space-y-2">
                <div>
                  <p className="font-semibold truncate">{t.clienteNombre}</p>
                  <div className="flex justify-between text-muted-foreground mt-0.5">
                    <span>Ticket: {t.numeroTicket}</span>
                    <span>{formatMoney(t.monto)}</span>
                  </div>
                  {t.esCoberturaGrupal && (
                    <p className="text-xs text-amber-600 mt-0.5">Cubierta por otra integrante</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => router.push(`/thermal-print?ticketId=${t.id}`)}
                >
                  <Printer className="h-3 w-3 mr-1" />Imprimir individual
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <Button variant="outline" className="w-full" onClick={() => router.push('/cobros/agenda')}>
          Volver a agenda
        </Button>
      </div>
    )
  }

  // ── CARGANDO ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary-700" />
      </div>
    )
  }

  // ── FORMULARIO ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href={`/cobros/grupo/${groupId}`}><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary-600" />
            <h1 className="text-lg font-bold">{grupoNombre}</h1>
          </div>
          <p className="text-sm text-muted-foreground">Registrar pagos del grupo</p>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-primary-50 rounded-lg p-3">
          <p className="text-xs text-primary-600 font-medium">Esperado</p>
          <p className="text-base font-bold text-primary-800">{formatMoney(totalEsperado)}</p>
        </div>
        <div className={`rounded-lg p-3 ${totalPagado < totalEsperado ? 'bg-amber-50' : 'bg-green-50'}`}>
          <p className={`text-xs font-medium ${totalPagado < totalEsperado ? 'text-amber-600' : 'text-green-600'}`}>Confirmado</p>
          <p className={`text-base font-bold ${totalPagado < totalEsperado ? 'text-amber-800' : 'text-green-800'}`}>{formatMoney(totalPagado)}</p>
        </div>
      </div>

      {/* Tarjeta por integrante */}
      {miembros.map((m) => {
        const st = states[m.clientId] ?? { status: 'PAID', metodoPago: 'CASH' }
        const otrasPagadoras = miembros.filter(
          (other) => other.clientId !== m.clientId && states[other.clientId]?.status === 'PAID'
        )

        return (
          <Card key={m.clientId} className={
            st.status === 'UNPAID'  ? 'border-red-200 bg-red-50' :
            st.status === 'COVERED' ? 'border-amber-200 bg-amber-50' :
            'border-green-200 bg-green-50'
          }>
            <CardContent className="p-4 space-y-3">
              {/* Nombre + monto */}
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{m.clientNombre}</p>
                  <p className="text-xs text-muted-foreground">Pago {m.numeroPago} de {m.totalPagos}</p>
                </div>
                <p className="text-lg font-bold">{formatMoney(m.monto)}</p>
              </div>

              {/* Botones SÍ / NO / CUBIERTA */}
              <div className="flex gap-2">
                <button
                  onClick={() => setStatus(m.clientId, 'PAID')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                    st.status === 'PAID'
                      ? 'border-green-500 bg-green-500 text-white'
                      : 'border-gray-200 hover:border-green-300'
                  }`}
                >
                  <CheckCircle className="h-4 w-4" />Pagó
                </button>
                <button
                  onClick={() => setStatus(m.clientId, 'COVERED')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                    st.status === 'COVERED'
                      ? 'border-amber-500 bg-amber-500 text-white'
                      : 'border-gray-200 hover:border-amber-300'
                  }`}
                >
                  <Users className="h-4 w-4" />Cubierta
                </button>
                <button
                  onClick={() => setStatus(m.clientId, 'UNPAID')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                    st.status === 'UNPAID'
                      ? 'border-red-500 bg-red-500 text-white'
                      : 'border-gray-200 hover:border-red-300'
                  }`}
                >
                  <XCircle className="h-4 w-4" />No pagó
                </button>
              </div>

              {/* Si CUBIERTA: elegir quién la cubrió */}
              {st.status === 'COVERED' && (
                <div>
                  <p className="text-xs text-amber-700 mb-1 font-medium">¿Quién la cubrió?</p>
                  {otrasPagadoras.length === 0 ? (
                    <p className="text-xs text-red-600">Ninguna integrante marcada como pagó. Marca al menos una como "Pagó" primero.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {otrasPagadoras.map((otra) => (
                        <button
                          key={otra.clientId}
                          onClick={() => setCubridor(m.clientId, otra.clientId)}
                          className={`text-xs px-3 py-1.5 rounded-full border-2 transition-colors ${
                            st.cubridoPorClienteId === otra.clientId
                              ? 'border-amber-500 bg-amber-500 text-white'
                              : 'border-gray-200 hover:border-amber-300'
                          }`}
                        >
                          {otra.clientNombre.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Método de pago (solo si pagó o cubrió) */}
              {st.status !== 'UNPAID' && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Método de pago</p>
                  <div className="flex gap-2">
                    {(['CASH', 'CARD', 'TRANSFER'] as Metodo[]).map((m2) => (
                      <button
                        key={m2}
                        onClick={() => setMetodo(m.clientId, m2)}
                        className={`flex-1 flex flex-col items-center gap-1 py-1.5 rounded-lg border text-[11px] transition-colors ${
                          st.metodoPago === m2
                            ? 'border-primary-500 bg-primary-50 text-primary-700 font-semibold'
                            : 'border-gray-200 text-muted-foreground hover:border-gray-300'
                        }`}
                      >
                        {m2 === 'CASH' && <Banknote className="h-3.5 w-3.5" />}
                        {m2 === 'CARD' && <CreditCard className="h-3.5 w-3.5" />}
                        {m2 === 'TRANSFER' && <Building2 className="h-3.5 w-3.5" />}
                        {m2 === 'CASH' ? 'Efectivo' : m2 === 'CARD' ? 'Tarjeta' : 'Transferencia'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}

      {/* Botón confirmar */}
      <Button
        className="w-full"
        size="lg"
        disabled={submitting || hayProblema}
        onClick={handleSubmit}
      >
        {submitting
          ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Procesando…</>
          : `Confirmar ${miembros.filter((m) => states[m.clientId]?.status !== 'UNPAID').length} pago(s) — ${formatMoney(totalPagado)}`
        }
      </Button>

      {hayProblema && (
        <p className="text-xs text-center text-red-600">
          Indica quién cubrió a la(s) integrante(s) marcada(s) como CUBIERTA
        </p>
      )}
    </div>
  )
}
