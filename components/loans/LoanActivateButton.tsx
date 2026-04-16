'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { CashBreakdownCalculator } from '@/components/payments/CashBreakdownCalculator'
import { formatMoney } from '@/lib/utils'
import {
  Zap,
  Loader2,
  CalendarDays,
  ShieldCheck,
  Banknote,
  CreditCard,
  Building2,
  CheckCircle,
} from 'lucide-react'
import type { CashBreakdownEntry } from '@/types'

interface BankAccount {
  id: string
  banco: string
  titular: string
  clabe: string
}

interface LoanActivateButtonProps {
  loanId: string
  seguroPendiente?: boolean
  fechaDesembolsoDG?: string | null
  fechaPrimerPagoDG?: string | null
  feeConcepto: 'SEGURO' | 'COMISION'
  feeMonto: number
  bankAccountsUrl?: string
}

type Step = 'info' | 'cash' | 'card' | 'transfer'

export function LoanActivateButton({
  loanId,
  seguroPendiente = false,
  fechaDesembolsoDG,
  fechaPrimerPagoDG,
  feeConcepto,
  feeMonto,
  bankAccountsUrl = '/api/bank-accounts',
}: LoanActivateButtonProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [step, setStep] = useState<Step>('info')
  const [fecha, setFecha] = useState(() => fechaDesembolsoDG ?? new Date().toISOString().slice(0, 10))

  // Transfer state
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState('')
  const [idTransferencia, setIdTransferencia] = useState('')

  // Fetch bank accounts on mount
  useEffect(() => {
    fetch(bankAccountsUrl)
      .then((r) => r.json())
      .then((d) => {
        if (d.data?.length) {
          setBankAccounts(d.data)
          setSelectedAccount(d.data[0].id)
        }
      })
      .catch(() => {})
  }, [bankAccountsUrl])

  const feeLabel = feeConcepto === 'SEGURO' ? 'Seguro de apertura' : 'Comision de apertura'

  async function handleActivate(
    metodoPago: 'CASH' | 'CARD' | 'TRANSFER',
    cashBreakdown?: CashBreakdownEntry[],
    cambioEntregado?: number
  ) {
    setLoading(true)
    try {
      const body: Record<string, unknown> = {
        fechaDesembolso: fecha,
        metodoPago,
      }

      if (metodoPago === 'CASH') {
        body.cashBreakdown = cashBreakdown ?? []
        body.cambioEntregado = cambioEntregado ?? 0
      }

      if (metodoPago === 'TRANSFER') {
        body.cuentaDestinoId = selectedAccount || undefined
        body.idTransferencia = idTransferencia || undefined
      }

      const res = await fetch(`/api/loans/${loanId}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al activar')

      if (data.seguroPendiente) {
        toast({
          title: 'Pago de apertura registrado',
          description: 'Se notificara al gerente para verificar la transferencia y activar el credito.',
        })
      } else {
        toast({
          title: 'Credito activado',
          description: 'El calendario de pagos fue generado.',
        })

        // Generate ticket for CASH payments
        if (metodoPago === 'CASH' && data.ticket) {
          router.push('/thermal-print')
          return
        }
      }

      router.refresh()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
      setShowForm(false)
      setStep('info')
    }
  }

  async function handleVerificar() {
    setLoading(true)
    try {
      const res = await fetch(`/api/loans/${loanId}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fechaDesembolso: fecha }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al activar')
      toast({
        title: 'Credito activado',
        description: 'La transferencia fue verificada y el credito ha sido activado.',
      })
      router.refresh()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  // ── Pending transfer verification view ──────────────────────────────────────
  if (seguroPendiente) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-amber-400 font-medium flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4" />
          Pago de apertura por transferencia — pendiente de verificacion
        </p>
        <Button
          size="sm"
          className="bg-green-600 hover:bg-green-700 text-white"
          disabled={loading}
          onClick={handleVerificar}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <ShieldCheck className="h-4 w-4 mr-1" />
              Verificar y activar
            </>
          )}
        </Button>
      </div>
    )
  }

  // ── Collapsed button ────────────────────────────────────────────────────────
  if (!showForm) {
    return (
      <Button
        size="sm"
        variant="default"
        className="bg-primary-600 hover:bg-primary-700 text-white"
        onClick={() => setShowForm(true)}
      >
        <Zap className="h-4 w-4 mr-1" />
        Activar credito
      </Button>
    )
  }

  // ── Expanded form ───────────────────────────────────────────────────────────
  return (
    <div className="bg-primary-500/10 border border-primary-500/30 rounded-lg p-4 space-y-4">
      {/* Header */}
      <p className="text-sm font-semibold text-primary-400 flex items-center gap-1.5">
        <Zap className="h-4 w-4" /> Activar credito
      </p>

      {/* ── STEP: INFO ─────────────────────────────────────────────────────── */}
      {step === 'info' && (
        <div className="space-y-4">
          {/* Fee info */}
          <div className="bg-primary-500/10 border border-primary-500/30 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">{feeLabel}</p>
            <p className="text-2xl font-bold text-primary-400 money">
              {formatMoney(feeMonto)}
            </p>
          </div>

          {/* Fecha de desembolso */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <CalendarDays className="h-3 w-3" /> Fecha de desembolso
            </label>
            {fechaDesembolsoDG ? (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{fechaDesembolsoDG}</span>
                <span className="text-xs text-primary-400 bg-primary-500/10 border border-primary-500/30 rounded px-2 py-0.5">
                  Fijada por el Director General
                </span>
              </div>
            ) : (
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="border border-gray-600 bg-gray-800 text-gray-100 rounded px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            )}
          </div>

          {/* Fecha del primer pago (if set by DG) */}
          {fechaPrimerPagoDG && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground flex items-center gap-1">
                <CalendarDays className="h-3 w-3" /> Fecha del primer pago
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{fechaPrimerPagoDG}</span>
                <span className="text-xs text-primary-400 bg-primary-500/10 border border-primary-500/30 rounded px-2 py-0.5">
                  Fijada por el Director General
                </span>
              </div>
            </div>
          )}

          {/* Payment method buttons — 3-column grid matching payment capture flow */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">Metodo de pago</p>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setStep('cash')}
                className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-gray-600 hover:border-primary-400 hover:bg-primary-500/10 transition-colors"
              >
                <Banknote className="h-7 w-7 text-primary-400" />
                <span className="font-medium text-sm">Efectivo</span>
              </button>
              <button
                type="button"
                onClick={() => setStep('card')}
                className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-gray-600 hover:border-primary-400 hover:bg-primary-500/10 transition-colors"
              >
                <CreditCard className="h-7 w-7 text-primary-400" />
                <span className="font-medium text-sm">Tarjeta</span>
              </button>
              <button
                type="button"
                onClick={() => setStep('transfer')}
                className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-gray-600 hover:border-primary-400 hover:bg-primary-500/10 transition-colors"
              >
                <Building2 className="h-7 w-7 text-primary-400" />
                <span className="font-medium text-sm">Transferencia</span>
              </button>
            </div>
          </div>

          {/* Cancel */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowForm(false)}
            className="w-full"
          >
            Cancelar
          </Button>
        </div>
      )}

      {/* ── STEP: CASH ─────────────────────────────────────────────────────── */}
      {step === 'cash' && (
        <CashBreakdownCalculator
          montoEsperado={feeMonto}
          disabled={loading}
          onCancel={() => setStep('info')}
          onConfirm={(breakdown, cambio) => handleActivate('CASH', breakdown, cambio)}
        />
      )}

      {/* ── STEP: CARD ─────────────────────────────────────────────────────── */}
      {step === 'card' && (
        <div className="space-y-4">
          <div className="bg-primary-500/10 border border-primary-500/30 rounded-lg p-4 text-center">
            <CreditCard className="h-8 w-8 text-primary-400 mx-auto mb-2" />
            <p className="font-medium">Pago con tarjeta</p>
            <p className="text-2xl font-bold text-primary-400 money mt-1">
              {formatMoney(feeMonto)}
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setStep('info')}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1"
              disabled={loading}
              onClick={() => handleActivate('CARD')}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <CheckCircle className="h-4 w-4" /> Confirmar
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP: TRANSFER ─────────────────────────────────────────────────── */}
      {step === 'transfer' && (
        <div className="space-y-4">
          <div className="bg-primary-500/10 border border-primary-500/30 rounded-lg p-4 text-center">
            <Building2 className="h-8 w-8 text-primary-400 mx-auto mb-2" />
            <p className="font-medium">Transferencia bancaria</p>
            <p className="text-2xl font-bold text-primary-400 money mt-1">
              {formatMoney(feeMonto)}
            </p>
          </div>

          {/* Bank account selector */}
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
                        ? 'border-primary-500 bg-primary-500/10'
                        : 'border-gray-600 hover:border-gray-500'
                    }`}
                  >
                    <p className="font-medium text-sm">
                      {acc.banco} — {acc.titular}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      CLABE: {acc.clabe}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Transfer reference */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium">ID / Referencia de transferencia</p>
            <input
              className="w-full border border-gray-600 bg-gray-800 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Numero de referencia..."
              value={idTransferencia}
              onChange={(e) => setIdTransferencia(e.target.value)}
            />
          </div>

          {/* Transfer warning */}
          <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            El credito quedara en estado aprobado con pago pendiente de verificacion.
            El Gerente Zonal debera confirmar que el dinero llego a la cuenta para
            activar el credito.
          </p>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setStep('info')}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1"
              disabled={loading}
              onClick={() => handleActivate('TRANSFER')}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <CheckCircle className="h-4 w-4" /> Registrar
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
