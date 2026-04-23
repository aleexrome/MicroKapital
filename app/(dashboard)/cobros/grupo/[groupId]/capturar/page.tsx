'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { formatMoney } from '@/lib/utils'
import { CashBreakdownCalculator } from '@/components/payments/CashBreakdownCalculator'
import {
  ArrowLeft, CheckCircle, Users, Banknote, CreditCard, Building2,
  Loader2, Printer, Download,
} from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { buildGroupTicketBytes, loadLogoBitmap, printViaBluetooth } from '@/lib/escpos'
import type { CashBreakdownEntry } from '@/types'

const LOGO_URL = 'https://res.cloudinary.com/djs8dtzrq/image/upload/v1776487061/ddcb6871-4cff-422e-9a00-67d62aa6243f.png'

type Step = 'summary' | 'method' | 'cash' | 'transfer' | 'card' | 'done'

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

interface BankAccount {
  id: string
  banco: string
  titular: string
  clabe: string
  numeroCuenta: string
}

interface GroupTicketMeta {
  empresa:  string
  sucursal: string
  cobrador: string
  fecha:    string
  qrCode:   string | null
}

interface TicketItem {
  id: string
  numeroTicket: string
  clienteNombre: string
  monto: number
}

export default function CapturarGrupoPage() {
  const params  = useParams()
  const groupId = params.groupId as string
  const router  = useRouter()
  const { toast } = useToast()

  const [miembros, setMiembros]       = useState<MiembroInfo[]>([])
  const [grupoNombre, setGrupoNombre] = useState('')
  const [loading, setLoading]         = useState(true)
  const [step, setStep]               = useState<Step>('summary')
  const [submitting, setSubmitting]   = useState(false)

  const [bankAccounts, setBankAccounts]     = useState<BankAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState('')
  const [idTransferencia, setIdTransferencia] = useState('')

  const [tickets, setTickets]     = useState<TicketItem[]>([])
  const [groupMeta, setGroupMeta] = useState<GroupTicketMeta | null>(null)
  const [metodoFinal, setMetodoFinal] = useState<'CASH' | 'CARD' | 'TRANSFER' | null>(null)
  const [printingGroup, setPrintingGroup] = useState(false)

  const totalEsperado = miembros.reduce((s, m) => s + m.monto, 0)

  useEffect(() => {
    fetch(`/api/cobros/grupo/${groupId}/miembros`)
      .then((r) => r.json())
      .then((d) => {
        setMiembros(d.data ?? [])
        setGrupoNombre(d.grupoNombre ?? '')
        setLoading(false)
      })
      .catch(() => setLoading(false))
    fetch('/api/bank-accounts')
      .then((r) => r.json())
      .then((d) => {
        if (d.data?.length) {
          setBankAccounts(d.data)
          setSelectedAccount(d.data[0].id)
        }
      })
  }, [groupId])

  async function submitPayment(
    metodoPago: 'CASH' | 'CARD' | 'TRANSFER',
    cashBreakdown?: CashBreakdownEntry[],
    cambio?: number,
  ) {
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        metodoPago,
        cambioEntregado: cambio ?? 0,
        cashBreakdown:   cashBreakdown ?? [],
      }
      if (metodoPago === 'TRANSFER') {
        body.cuentaDestinoId = selectedAccount || undefined
        body.idTransferencia = idTransferencia || undefined
      }

      const res = await fetch(`/api/cobros/grupo/${groupId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        let msg = `Error ${res.status}`
        try {
          const b = await res.json()
          if (typeof b?.error === 'string') msg = b.error
          else if (b?.error) msg = JSON.stringify(b.error)
        } catch { /* no-json */ }
        throw new Error(msg)
      }
      const data = await res.json()
      setTickets(data.tickets ?? [])
      if (data.groupTicketMeta) setGroupMeta(data.groupTicketMeta)
      setMetodoFinal(metodoPago)
      setStep('done')
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'No se pudo registrar el pago',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleGroupPrint() {
    if (!groupMeta || !metodoFinal) return
    setPrintingGroup(true)
    try {
      let logo: { pixels: Uint8Array; widthPx: number; heightPx: number } | undefined
      try { logo = await loadLogoBitmap(LOGO_URL, 384) } catch { /* no-logo */ }

      const fechaD = new Date(groupMeta.fecha)
      const integrantes = miembros.map((m) => ({
        cliente: m.clientNombre,
        monto:   formatMoney(m.monto),
      }))

      const bytes = buildGroupTicketBytes({
        empresa:     groupMeta.empresa,
        sucursal:    groupMeta.sucursal,
        fecha:       format(fechaD, 'dd/MM/yyyy'),
        hora:        format(fechaD, 'HH:mm'),
        cobrador:    groupMeta.cobrador,
        grupoNombre,
        integrantes,
        totalCobrado: formatMoney(totalEsperado),
        metodoPago:   metodoFinal === 'CASH' ? 'Efectivo' : metodoFinal === 'CARD' ? 'Tarjeta' : 'Transferencia',
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

  // ── Cargando ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary-700" />
      </div>
    )
  }

  if (miembros.length === 0) {
    return (
      <div className="p-6 text-center space-y-4">
        <p className="text-muted-foreground">No hay pagos pendientes para este grupo.</p>
        <Button variant="outline" onClick={() => router.back()}>Volver</Button>
      </div>
    )
  }

  // ── DONE: ticket generado ───────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className="p-4 space-y-4 max-w-md mx-auto">
        <div className="flex items-center gap-2 text-emerald-400">
          <CheckCircle className="h-6 w-6" />
          <h2 className="text-lg font-bold">¡Pagos registrados!</h2>
        </div>

        {/* Resumen */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Grupo</p>
              <p className="font-semibold">{grupoNombre}</p>
            </div>
            <div className="divide-y divide-border/40">
              {miembros.map((m) => (
                <div key={m.clientId} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="truncate">{m.clientNombre}</span>
                  <span className="font-medium shrink-0">{formatMoney(m.monto)}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="font-semibold">Total</span>
              <span className="text-lg font-bold text-primary-300">{formatMoney(totalEsperado)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Método</span>
              <span>
                {metodoFinal === 'CASH' ? '💵 Efectivo'
                  : metodoFinal === 'CARD' ? '💳 Tarjeta'
                  : '🏦 Transferencia'}
              </span>
            </div>
            {metodoFinal === 'TRANSFER' && (
              <Badge variant="warning" className="text-[10px]">
                Pendiente de verificación por gerencia
              </Badge>
            )}
          </CardContent>
        </Card>

        {/* Acciones */}
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={handleGroupPrint} disabled={printingGroup}>
            {printingGroup
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <><Printer className="h-4 w-4" /> Imprimir BT</>}
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Download className="h-4 w-4" /> Guardar PDF
          </Button>
        </div>

        {tickets.length > 0 && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Tickets individuales ({tickets.length})</summary>
            <ul className="mt-1 space-y-0.5 ml-2">
              {tickets.map((t) => (
                <li key={t.id}>
                  <a
                    href={`/thermal-print?ticketId=${t.id}`}
                    className="underline hover:text-primary-300"
                  >
                    {t.numeroTicket} — {t.clienteNombre}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        )}

        <Button variant="ghost" className="w-full" onClick={() => router.push('/cobros/agenda')}>
          Volver a agenda
        </Button>
      </div>
    )
  }

  // ── Header común ────────────────────────────────────────────────────────────
  const header = (
    <div className="flex items-center gap-3">
      <Button asChild variant="ghost" size="icon">
        <Link href={`/cobros/grupo/${groupId}`}><ArrowLeft className="h-4 w-4" /></Link>
      </Button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary-600 shrink-0" />
          <h1 className="text-lg font-bold truncate">{grupoNombre}</h1>
        </div>
        <p className="text-xs text-muted-foreground">Pago grupal — {miembros.length} integrantes</p>
      </div>
    </div>
  )

  // ── SUMMARY ─────────────────────────────────────────────────────────────────
  if (step === 'summary') {
    return (
      <div className="p-4 space-y-4 max-w-md mx-auto">
        {header}

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="divide-y divide-border/40">
              {miembros.map((m) => (
                <div key={m.clientId} className="flex items-center justify-between py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{m.clientNombre}</p>
                    <p className="text-xs text-muted-foreground">Pago {m.numeroPago} de {m.totalPagos}</p>
                  </div>
                  <span className="font-semibold shrink-0">{formatMoney(m.monto)}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="font-semibold">Total a cobrar</span>
              <span className="text-2xl font-bold text-primary-300">{formatMoney(totalEsperado)}</span>
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center">
          Si alguna integrante no trae su parte, sal y cóbrale individualmente desde su expediente.
        </p>

        <Button size="lg" className="w-full" onClick={() => setStep('method')}>
          Confirmar y cobrar
        </Button>
      </div>
    )
  }

  // ── METHOD ──────────────────────────────────────────────────────────────────
  if (step === 'method') {
    return (
      <div className="p-4 space-y-4 max-w-md mx-auto">
        {header}
        <Card className="bg-primary-500/5 border-primary-500/20">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-primary-300">Total del grupo</p>
            <p className="text-3xl font-bold text-primary-200">{formatMoney(totalEsperado)}</p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => setStep('cash')}
            className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-border hover:border-primary-500 hover:bg-primary-500/5 transition-colors"
          >
            <Banknote className="h-7 w-7 text-primary-400" />
            <span className="font-medium text-sm">Efectivo</span>
          </button>
          <button
            onClick={() => setStep('card')}
            className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-border hover:border-primary-500 hover:bg-primary-500/5 transition-colors"
          >
            <CreditCard className="h-7 w-7 text-primary-400" />
            <span className="font-medium text-sm">Tarjeta</span>
          </button>
          <button
            onClick={() => setStep('transfer')}
            className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-border hover:border-primary-500 hover:bg-primary-500/5 transition-colors"
          >
            <Building2 className="h-7 w-7 text-primary-400" />
            <span className="font-medium text-sm">Transferencia</span>
          </button>
        </div>

        <Button variant="ghost" className="w-full" onClick={() => setStep('summary')}>
          Atrás
        </Button>
      </div>
    )
  }

  // ── CASH ────────────────────────────────────────────────────────────────────
  if (step === 'cash') {
    return (
      <div className="p-4 space-y-4 max-w-md mx-auto">
        {header}
        <CashBreakdownCalculator
          montoEsperado={totalEsperado}
          disabled={submitting}
          onCancel={() => setStep('method')}
          onConfirm={(breakdown, cambio) => submitPayment('CASH', breakdown, cambio)}
        />
      </div>
    )
  }

  // ── CARD ────────────────────────────────────────────────────────────────────
  if (step === 'card') {
    return (
      <div className="p-4 space-y-4 max-w-md mx-auto">
        {header}
        <Card className="bg-primary-500/5 border-primary-500/20">
          <CardContent className="p-4 text-center">
            <CreditCard className="h-8 w-8 text-primary-400 mx-auto mb-2" />
            <p className="font-medium">Pago con tarjeta — grupo completo</p>
            <p className="text-2xl font-bold text-primary-200 mt-1">{formatMoney(totalEsperado)}</p>
          </CardContent>
        </Card>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => setStep('method')} disabled={submitting}>
            Atrás
          </Button>
          <Button className="flex-1" onClick={() => submitPayment('CARD')} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle className="h-4 w-4" /> Confirmar</>}
          </Button>
        </div>
      </div>
    )
  }

  // ── TRANSFER ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
      {header}
      <Card className="bg-primary-500/5 border-primary-500/20">
        <CardContent className="p-4 text-center">
          <Building2 className="h-8 w-8 text-primary-400 mx-auto mb-2" />
          <p className="font-medium">Transferencia — grupo completo</p>
          <p className="text-2xl font-bold text-primary-200 mt-1">{formatMoney(totalEsperado)}</p>
        </CardContent>
      </Card>

      {bankAccounts.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Cuenta destino</p>
          <div className="space-y-2">
            {bankAccounts.map((acc) => (
              <button
                key={acc.id}
                type="button"
                onClick={() => setSelectedAccount(acc.id)}
                className={`w-full text-left rounded-lg border-2 p-3 transition-colors ${
                  selectedAccount === acc.id
                    ? 'border-primary-500 bg-primary-500/5'
                    : 'border-border hover:border-primary-500/50'
                }`}
              >
                <p className="font-medium text-sm">{acc.banco} — {acc.titular}</p>
                <p className="text-xs text-muted-foreground">CLABE: {acc.clabe}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-sm font-medium">ID / Referencia de transferencia</p>
        <input
          className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
          placeholder="Número de referencia…"
          value={idTransferencia}
          onChange={(e) => setIdTransferencia(e.target.value)}
        />
      </div>

      <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
        El pago quedará pendiente de verificación. El Gerente Zonal deberá confirmar que el dinero llegó a la cuenta.
      </p>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={() => setStep('method')} disabled={submitting}>
          Atrás
        </Button>
        <Button className="flex-1" onClick={() => submitPayment('TRANSFER')} disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle className="h-4 w-4" /> Registrar</>}
        </Button>
      </div>
    </div>
  )
}
