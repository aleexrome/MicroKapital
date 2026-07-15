'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CashBreakdownCalculator } from '@/components/payments/CashBreakdownCalculator'
import { TicketPreview } from '@/components/payments/TicketPreview'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatMoney } from '@/lib/utils'
import { useToast } from '@/components/ui/use-toast'
import { ArrowLeft, Banknote, CreditCard, Building2, Printer, Loader2, CheckCircle, Clock, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import type { TicketData, CashBreakdownEntry } from '@/types'
import { opcionesMora, opcionParaTipo, labelMora, type MoraTipo } from '@/lib/moras'

interface ScheduleDetail {
  id: string
  numeroPago: number
  fechaVencimiento: string
  loan: {
    id: string
    tipo: string
    plazo: number
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
}

type PaymentStep = 'method' | 'cash_calc' | 'confirm_card' | 'confirm_transfer' | 'done' | 'transfer_pending'

export default function CapturarMoraPage({ params }: { params: { scheduleId: string } }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tipoParam = searchParams.get('tipo')
  const tipoSolicitado: MoraTipo | null =
    tipoParam === 'MULTA' || tipoParam === 'MORA' ? tipoParam : null
  const { toast } = useToast()
  const [schedule, setSchedule] = useState<ScheduleDetail | null>(null)
  const [loadingSchedule, setLoadingSchedule] = useState(true)
  const [step, setStep] = useState<PaymentStep>('method')
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
    fetch('/api/bank-accounts')
      .then((r) => r.json())
      .then((d) => { if (d.data?.length) { setBankAccounts(d.data); setSelectedAccount(d.data[0].id) } })
  }, [params.scheduleId])

  async function submitMora(
    metodoPago: 'CASH' | 'CARD' | 'TRANSFER',
    cashBreakdown?: CashBreakdownEntry[],
    cambio?: number,
  ) {
    if (!schedule) return
    if (!tipoSolicitado) return
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        tipo: tipoSolicitado,
        metodoPago,
        cambioEntregado: cambio ?? 0,
        cashBreakdown: cashBreakdown ?? [],
      }
      if (metodoPago === 'TRANSFER') {
        body.cuentaDestinoId = selectedAccount || undefined
        body.idTransferencia = idTransferencia || undefined
      }
      const res = await fetch(
        `/api/loans/${schedule.loan.id}/schedule/${schedule.id}/mora/cobrar`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Error al cobrar la mora')
      }
      const { data } = await res.json()

      // TRANSFER queda pendiente igual que en pagos normales.
      if (metodoPago === 'TRANSFER') {
        setStep('transfer_pending')
        return
      }

      setTicketId(data.ticket.id)
      setTicketData({
        numeroTicket: data.ticket.numeroTicket,
        fecha: new Date(data.payment.fechaHora),
        empresa: 'MicroKapital',
        sucursal: data.branchName,
        cobrador: data.cobradorName,
        cliente: schedule.loan.client.nombreCompleto,
        loanId: schedule.loan.id,
        tipoPrestamo: schedule.loan.tipo,
        numeroPago: schedule.numeroPago,
        totalPagos: schedule.loan.plazo,
        montoPagado: data.mora.monto,
        metodoPago: metodoPago === 'CASH' ? 'Efectivo' : 'Tarjeta',
        recibido: metodoPago === 'CASH' ? data.mora.monto + (cambio ?? 0) : undefined,
        cambio,
        desglose: cashBreakdown,
        qrCode: data.ticket.qrCode,
      })
      setStep('done')
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'No se pudo cobrar la mora',
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

  const opciones = opcionesMora(new Date(schedule.fechaVencimiento), new Date())
  const preview = tipoSolicitado ? opcionParaTipo(opciones, tipoSolicitado) : null
  if (!preview) {
    const razon = !tipoSolicitado
      ? 'Falta indicar el tipo (multa o mora) en la URL.'
      : `${labelMora(tipoSolicitado)} no aplica para este pago en este momento.`
    return (
      <div className="p-4 space-y-4 max-w-sm mx-auto">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <h2 className="text-lg font-bold">Sin cargo aplicable</h2>
        </div>
        <p className="text-sm text-muted-foreground">{razon}</p>
        <Button asChild variant="outline" className="w-full">
          <Link href={`/prestamos/${schedule.loan.id}`}>Volver al préstamo</Link>
        </Button>
      </div>
    )
  }

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
              El cobro de la {preview.tipo === 'MULTA' ? 'multa' : 'mora'} quedó registrado como pendiente. El Gerente Zonal debe confirmar que el dinero llegó a la cuenta destino.
            </p>
          </CardContent>
        </Card>
        <Button asChild className="w-full" variant="outline">
          <Link href={`/prestamos/${schedule.loan.id}`}>Volver al préstamo</Link>
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
          <h2 className="text-lg font-bold">¡{labelMora(preview.tipo)} cobrada!</h2>
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
          <Button variant="outline" className="flex-1" asChild>
            <Link href={`/prestamos/${schedule.loan.id}`}>Volver al préstamo</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4 max-w-sm mx-auto">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href={`/prestamos/${schedule.loan.id}`}><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-lg font-bold">Cobrar {labelMora(preview.tipo).toLowerCase()}</h1>
          <p className="text-sm text-muted-foreground">Pago {schedule.numeroPago} de {schedule.loan.plazo}</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <p className="font-semibold text-gray-900">{schedule.loan.client.nombreCompleto}</p>
          {schedule.loan.client.telefono && (
            <p className="text-sm text-muted-foreground">{schedule.loan.client.telefono}</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="info">{schedule.loan.tipo}</Badge>
            <Badge variant="warning" className={
              preview.tipo === 'MORA' ? 'border-rose-400 text-rose-500 bg-rose-500/10' : 'border-amber-400 text-amber-500 bg-amber-500/10'
            }>
              {labelMora(preview.tipo)}
            </Badge>
          </div>
          <div className="mt-3 text-center">
            <p className="text-xs text-muted-foreground">Monto a cobrar</p>
            <p className="text-3xl font-bold text-amber-500 money">{formatMoney(preview.monto)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {preview.tipo === 'MULTA'
                ? 'Pago capturado el mismo día después de las 2 pm.'
                : 'Pago capturado un día después del vencimiento (o más).'}
            </p>
          </div>
        </CardContent>
      </Card>

      {step === 'method' && (
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
      )}

      {step === 'cash_calc' && (
        <CashBreakdownCalculator
          montoEsperado={preview.monto}
          disabled={submitting}
          onCancel={() => setStep('method')}
          onConfirm={(breakdown, cambio) => submitMora('CASH', breakdown, cambio)}
        />
      )}

      {step === 'confirm_card' && (
        <div className="space-y-4">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4 text-center">
              <CreditCard className="h-8 w-8 text-blue-600 mx-auto mb-2" />
              <p className="font-medium">Pago con tarjeta</p>
              <p className="text-2xl font-bold text-blue-800 money mt-1">{formatMoney(preview.monto)}</p>
            </CardContent>
          </Card>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setStep('method')} disabled={submitting}>Cancelar</Button>
            <Button className="flex-1" disabled={submitting} onClick={() => submitMora('CARD')}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle className="h-4 w-4" /> Confirmar</>}
            </Button>
          </div>
        </div>
      )}

      {step === 'confirm_transfer' && (
        <div className="space-y-4">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4 text-center">
              <Building2 className="h-8 w-8 text-blue-600 mx-auto mb-2" />
              <p className="font-medium">Transferencia bancaria</p>
              <p className="text-2xl font-bold text-blue-800 money mt-1">{formatMoney(preview.monto)}</p>
            </CardContent>
          </Card>
          {bankAccounts.length > 0 && (
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
          )}
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="ID / Referencia..."
            value={idTransferencia}
            onChange={(e) => setIdTransferencia(e.target.value)}
          />
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setStep('method')} disabled={submitting}>Cancelar</Button>
            <Button className="flex-1" disabled={submitting} onClick={() => submitMora('TRANSFER')}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle className="h-4 w-4" /> Registrar</>}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
