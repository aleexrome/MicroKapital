'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CashBreakdownCalculator } from '@/components/payments/CashBreakdownCalculator'
import { TicketPreview } from '@/components/payments/TicketPreview'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatMoney } from '@/lib/utils'
import { useToast } from '@/components/ui/use-toast'
import { ArrowLeft, Banknote, CreditCard, Building2, Printer, Loader2, CheckCircle, Clock } from 'lucide-react'
import Link from 'next/link'
import type { TicketData, CashBreakdownEntry } from '@/types'

interface ScheduleDetail {
  id: string
  numeroPago: number
  montoEsperado: string
  montoPagado: string
  fechaVencimiento: string
  loan: {
    id: string
    tipo: string
    plazo: number
    totalPago: string
    client: {
      id: string
      nombreCompleto: string
      telefono: string | null
    }
  }
}

interface BankAccount {
  id: string
  banco: string
  titular: string
  clabe: string
  numeroCuenta: string
}

type PaymentStep = 'modo' | 'method' | 'cash_calc' | 'confirm_card' | 'confirm_transfer' | 'done' | 'transfer_pending'
type ModoCobro = 'total' | 'parcial'

export default function CapturarPagoPage({ params }: { params: { scheduleId: string } }) {
  const router = useRouter()
  const { toast } = useToast()
  const [schedule, setSchedule] = useState<ScheduleDetail | null>(null)
  const [loadingSchedule, setLoadingSchedule] = useState(true)
  // Flujo: primero se elige Total vs Parcial (arma el monto a cobrar),
  // luego se elige el método (efectivo/tarjeta/transferencia).
  const [step, setStep] = useState<PaymentStep>('modo')
  const [modo, setModo] = useState<ModoCobro | null>(null)
  // Monto en pesos como string (facilita input libre). Se valida contra
  // el faltante al confirmar.
  const [montoInput, setMontoInput] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [ticketData, setTicketData] = useState<TicketData | null>(null)
  const [ticketId, setTicketId] = useState<string | null>(null)
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState<string>('')
  const [idTransferencia, setIdTransferencia] = useState('')

  useEffect(() => {
    fetch(`/api/payments/schedule/${params.scheduleId}`)
      .then((r) => r.json())
      .then((d) => { setSchedule(d.data); setLoadingSchedule(false) })
    // Bank accounts filtradas a la sucursal del préstamo (backend
    // resuelve branchId desde el scheduleId).
    fetch(`/api/bank-accounts?scheduleId=${params.scheduleId}`)
      .then((r) => r.json())
      .then((d) => { if (d.data?.length) { setBankAccounts(d.data); setSelectedAccount(d.data[0].id) } })
  }, [params.scheduleId])

  async function submitPayment(
    metodoPago: 'CASH' | 'CARD' | 'TRANSFER',
    cashBreakdown?: CashBreakdownEntry[],
    cambio?: number
  ) {
    if (!schedule) return
    // Requiere haber definido monto (via modo).
    const montoAPagar = getMontoAPagar()
    if (montoAPagar <= 0) {
      toast({ title: 'Monto inválido', variant: 'destructive' })
      return
    }
    setSubmitting(true)

    try {
      const body: Record<string, unknown> = {
        scheduleId: schedule.id,
        metodoPago,
        monto: montoAPagar,
        cambioEntregado: cambio ?? 0,
        cashBreakdown: cashBreakdown ?? [],
      }

      if (metodoPago === 'TRANSFER') {
        body.cuentaDestinoId = selectedAccount || undefined
        body.idTransferencia = idTransferencia || undefined
      }

      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Error al registrar el pago')
      }

      const { data } = await res.json()

      // Transferencia: queda pendiente de verificación, no se emite ticket aún
      if (data.pending) {
        setStep('transfer_pending')
        return
      }

      setTicketId(data.ticket.id)

      // Construir datos del ticket
      setTicketData({
        numeroTicket: data.ticket.numeroTicket,
        fecha: new Date(data.payment.fechaHora),
        empresa: data.companyName,
        sucursal: data.branchName,
        cobrador: data.cobradorName,
        cliente: schedule.loan.client.nombreCompleto,
        loanId: schedule.loan.id,
        tipoPrestamo: schedule.loan.tipo,
        numeroPago: schedule.numeroPago,
        totalPagos: schedule.loan.plazo,
        montoPagado: montoAPagar,
        metodoPago: metodoPago === 'CASH' ? 'Efectivo' : metodoPago === 'CARD' ? 'Tarjeta' : 'Transferencia',
        recibido: metodoPago === 'CASH' ? montoAPagar + (cambio ?? 0) : undefined,
        cambio: cambio,
        desglose: cashBreakdown,
        qrCode: data.ticket.qrCode,
      })

      setStep('done')
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'No se pudo registrar el pago',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingSchedule) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary-700" />
      </div>
    )
  }

  if (!schedule) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">No se encontró el cobro</p>
        <Button asChild className="mt-4" variant="outline">
          <Link href="/cobros/agenda">Volver a agenda</Link>
        </Button>
      </div>
    )
  }

  // Faltante = lo que aun se puede cobrar en esta cuota. Al elegir
  // Total precargamos justamente el faltante; al elegir Parcial el
  // coord ingresa un monto libre pero acotado a este maximo.
  const montoEsperado = Number(schedule.montoEsperado)
  const montoYaPagado = Number(schedule.montoPagado ?? 0)
  const montoFaltante = Math.max(0, montoEsperado - montoYaPagado)
  // Monto que efectivamente cobraremos en este submit — depende del modo.
  function getMontoAPagar(): number {
    if (modo === 'total') return montoFaltante
    if (modo === 'parcial') {
      const n = Number(montoInput)
      if (!Number.isFinite(n) || n <= 0) return 0
      return Math.min(n, montoFaltante)
    }
    return 0
  }
  const monto = getMontoAPagar() || montoFaltante

  // ── PASO: TRANSFERENCIA PENDIENTE DE VERIFICACIÓN ──────────────────────────
  if (step === 'transfer_pending') {
    return (
      <div className="p-4 space-y-4 max-w-sm mx-auto">
        <div className="flex items-center gap-2 text-yellow-600">
          <Clock className="h-6 w-6" />
          <h2 className="text-lg font-bold">Transferencia registrada</h2>
        </div>

        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="p-4 space-y-2 text-sm">
            <p className="font-medium text-yellow-800">En proceso de validación</p>
            <p className="text-yellow-700">
              El pago quedó registrado con estado <span className="font-semibold">pendiente</span>. El Gerente Zonal debe confirmar que el dinero llegó a la cuenta destino antes de que se aplique al calendario de pagos.
            </p>
            <div className="pt-2 text-yellow-800">
              <p><span className="text-yellow-600/80">Cliente:</span> {schedule.loan.client.nombreCompleto}</p>
              <p><span className="text-yellow-600/80">Monto:</span> <span className="font-semibold money">{formatMoney(monto)}</span></p>
              {idTransferencia && <p><span className="text-yellow-600/80">Referencia:</span> <span className="font-mono">{idTransferencia}</span></p>}
            </div>
          </CardContent>
        </Card>

        <Button className="w-full" variant="outline" onClick={() => router.push('/cobros/agenda')}>
          Volver a agenda
        </Button>
      </div>
    )
  }

  // ── PASO: TICKET GENERADO ──────────────────────────────────────────────────
  if (step === 'done' && ticketData) {
    return (
      <div className="p-4 space-y-4 max-w-sm mx-auto">
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle className="h-6 w-6" />
          <h2 className="text-lg font-bold">¡Pago registrado!</h2>
        </div>

        <TicketPreview data={ticketData} />

        <div className="flex gap-3">
          <Button
            className="flex-1"
            disabled={!ticketId}
            onClick={() => ticketId && router.push(`/thermal-print?ticketId=${ticketId}`)}
          >
            <Printer className="h-4 w-4" />
            Imprimir ticket
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => router.push('/cobros/agenda')}>
            Volver a agenda
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4 max-w-sm mx-auto">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/cobros/agenda"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-lg font-bold">Capturar pago</h1>
          <p className="text-sm text-muted-foreground">Pago {schedule.numeroPago} de {schedule.loan.plazo}</p>
        </div>
      </div>

      {/* Info del cliente */}
      <Card>
        <CardContent className="p-4">
          <p className="font-semibold text-gray-900">{schedule.loan.client.nombreCompleto}</p>
          {schedule.loan.client.telefono && (
            <p className="text-sm text-muted-foreground">{schedule.loan.client.telefono}</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="info">{schedule.loan.tipo}</Badge>
            <span className="text-sm text-muted-foreground">Pago {schedule.numeroPago}/{schedule.loan.plazo}</span>
          </div>
          <div className="mt-3 text-center">
            <p className="text-xs text-muted-foreground">
              {modo === 'parcial' ? 'Cobro parcial — monto a cobrar' : 'Monto a cobrar'}
            </p>
            <p className="text-3xl font-bold text-primary-400 money">{formatMoney(monto)}</p>
            {montoYaPagado > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Ya cobrado <strong className="text-emerald-400">{formatMoney(montoYaPagado)}</strong> de {formatMoney(montoEsperado)} · faltante <strong className="text-amber-400">{formatMoney(montoFaltante)}</strong>
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── ELECCIÓN DE MODO: TOTAL vs PARCIAL ─────────────────────────────── */}
      {step === 'modo' && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">
            ¿Cuánto va a pagar el cliente?
          </p>
          <button
            type="button"
            onClick={() => { setModo('total'); setMontoInput(''); setStep('method') }}
            className="w-full text-left rounded-xl border-2 border-border hover:border-primary-500/60 hover:bg-primary-500/10 transition-colors p-4"
          >
            <p className="font-semibold text-primary-400">Cobro total</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Cobra el faltante completo: <strong className="text-primary-400 money">{formatMoney(montoFaltante)}</strong>
            </p>
          </button>
          <button
            type="button"
            onClick={() => setModo('parcial')}
            className={`w-full text-left rounded-xl border-2 transition-colors p-4 ${
              modo === 'parcial'
                ? 'border-amber-400/60 bg-amber-500/10'
                : 'border-border hover:border-amber-400/60 hover:bg-amber-500/5'
            }`}
          >
            <p className="font-semibold text-amber-400">Cobro parcial</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              El cliente da un monto menor. Puedes capturar cuantos parciales necesites hasta liquidar la cuota.
            </p>
          </button>

          {modo === 'parcial' && (
            <div className="space-y-2 border-t border-border/40 pt-3">
              <label className="text-sm font-medium text-foreground">Monto que trae el cliente</label>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-amber-400">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={1}
                  max={montoFaltante}
                  step="1"
                  placeholder="0.00"
                  value={montoInput}
                  onChange={(e) => setMontoInput(e.target.value)}
                  className="flex-1 rounded-lg border-2 border-amber-400/40 focus:border-amber-400 focus:outline-none bg-background text-foreground px-3 py-2 text-lg font-semibold"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Máximo permitido: <strong className="text-foreground">{formatMoney(montoFaltante)}</strong>
              </p>
              <Button
                className="w-full"
                disabled={getMontoAPagar() <= 0}
                onClick={() => setStep('method')}
              >
                Continuar
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── SELECCIÓN DE MÉTODO ────────────────────────────────────────────── */}
      {step === 'method' && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setStep('modo')}
            className="text-xs text-primary-400 hover:underline"
          >
            ← Cambiar monto
          </button>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setStep('cash_calc')}
              className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-gray-200 hover:border-primary-400 hover:bg-primary-50 transition-colors"
            >
              <Banknote className="h-7 w-7 text-primary-600" />
              <span className="font-medium text-sm">Efectivo</span>
            </button>
            <button
              onClick={() => setStep('confirm_card')}
              className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-gray-200 hover:border-primary-400 hover:bg-primary-50 transition-colors"
            >
              <CreditCard className="h-7 w-7 text-primary-600" />
              <span className="font-medium text-sm">Tarjeta</span>
            </button>
            <button
              onClick={() => setStep('confirm_transfer')}
              className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-gray-200 hover:border-primary-400 hover:bg-primary-50 transition-colors"
            >
              <Building2 className="h-7 w-7 text-primary-600" />
              <span className="font-medium text-sm">Transferencia</span>
            </button>
          </div>
        </div>
      )}

      {/* ── CALCULADORA DE EFECTIVO ────────────────────────────────────────── */}
      {step === 'cash_calc' && (
        <CashBreakdownCalculator
          montoEsperado={monto}
          disabled={submitting}
          onCancel={() => setStep('method')}
          onConfirm={(breakdown, cambio) => submitPayment('CASH', breakdown, cambio)}
        />
      )}

      {/* ── PAGO POR TRANSFERENCIA ─────────────────────────────────────────── */}
      {step === 'confirm_transfer' && (
        <div className="space-y-4">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4 text-center">
              <Building2 className="h-8 w-8 text-blue-600 mx-auto mb-2" />
              <p className="font-medium">Transferencia bancaria</p>
              <p className="text-2xl font-bold text-blue-800 money mt-1">{formatMoney(monto)}</p>
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
                        ? 'border-primary-700 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
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
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="Número de referencia..."
              value={idTransferencia}
              onChange={(e) => setIdTransferencia(e.target.value)}
            />
          </div>

          <p className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            El pago quedará pendiente de verificación. El Gerente Zonal deberá confirmar que el dinero llegó a la cuenta.
          </p>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setStep('method')} disabled={submitting}>
              Cancelar
            </Button>
            <Button
              className="flex-1"
              disabled={submitting}
              onClick={() => submitPayment('TRANSFER')}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle className="h-4 w-4" /> Registrar</>}
            </Button>
          </div>
        </div>
      )}

      {/* ── CONFIRMAR PAGO CON TARJETA ─────────────────────────────────────── */}
      {step === 'confirm_card' && (
        <div className="space-y-4">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4 text-center">
              <CreditCard className="h-8 w-8 text-blue-600 mx-auto mb-2" />
              <p className="font-medium">Pago con tarjeta</p>
              <p className="text-2xl font-bold text-blue-800 money mt-1">{formatMoney(monto)}</p>
            </CardContent>
          </Card>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setStep('method')} disabled={submitting}>
              Cancelar
            </Button>
            <Button
              className="flex-1"
              disabled={submitting}
              onClick={() => submitPayment('CARD')}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle className="h-4 w-4" /> Confirmar</>}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
