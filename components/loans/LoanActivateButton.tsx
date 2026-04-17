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
  BadgePercent,
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
  capital: number
  descuentoRenovacion?: number
  bankAccountsUrl?: string
}

type Step = 'info' | 'cash' | 'card' | 'transfer' | 'financiado'

export function LoanActivateButton({
  loanId,
  seguroPendiente = false,
  fechaDesembolsoDG,
  fechaPrimerPagoDG,
  feeConcepto,
  feeMonto,
  capital,
  descuentoRenovacion = 0,
  bankAccountsUrl = '/api/bank-accounts',
}: LoanActivateButtonProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [step, setStep] = useState<Step>('info')

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
    metodoPago: 'CASH' | 'CARD' | 'TRANSFER' | 'FINANCIADO',
    cashBreakdown?: CashBreakdownEntry[],
    cambioEntregado?: number
  ) {
    setLoading(true)
    try {
      const body: Record<string, unknown> = { metodoPago }

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
        body: JSON.stringify({}),
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

          {/* Fechas fijadas por Dirección General */}
          {(fechaDesembolsoDG || fechaPrimerPagoDG) && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              {fechaDesembolsoDG && (
                <div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                    <CalendarDays className="h-3 w-3" /> Desembolso
                  </p>
                  <p className="font-medium">{fechaDesembolsoDG}</p>
                </div>
              )}
              {fechaPrimerPagoDG && (
                <div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                    <CalendarDays className="h-3 w-3" /> Primer pago
                  </p>
                  <p className="font-medium">{fechaPrimerPagoDG}</p>
                </div>
              )}
            </div>
          )}

          {/* Payment method buttons — 3-column grid matching payment capture flow */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">Metodo de pago</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button
                type="button"
                onClick={() => setStep('cash')}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-gray-600 hover:border-primary-400 hover:bg-primary-500/10 transition-colors"
              >
                <Banknote className="h-7 w-7 text-primary-400" />
                <span className="font-medium text-sm">Efectivo</span>
              </button>
              <button
                type="button"
                onClick={() => setStep('card')}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-gray-600 hover:border-primary-400 hover:bg-primary-500/10 transition-colors"
              >
                <CreditCard className="h-7 w-7 text-primary-400" />
                <span className="font-medium text-sm">Tarjeta</span>
              </button>
              <button
                type="button"
                onClick={() => setStep('transfer')}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-gray-600 hover:border-primary-400 hover:bg-primary-500/10 transition-colors"
              >
                <Building2 className="h-7 w-7 text-primary-400" />
                <span className="font-medium text-sm">Transferencia</span>
              </button>
              <button
                type="button"
                onClick={() => setStep('financiado')}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-amber-500/40 hover:border-amber-400 hover:bg-amber-500/10 transition-colors"
              >
                <BadgePercent className="h-7 w-7 text-amber-400" />
                <span className="font-medium text-sm">Financiado</span>
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

      {/* ── STEP: FINANCIADO ──────────────────────────────────────────────── */}
      {step === 'financiado' && (
        <div className="space-y-4">
          {(() => {
            const montoFinal = capital - descuentoRenovacion - feeMonto
            return (
              <>
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-center">
                  <BadgePercent className="h-8 w-8 text-amber-400 mx-auto mb-2" />
                  <p className="font-medium text-amber-300">Financiado — descuento sobre capital</p>
                  <div className="mt-3 space-y-1">
                    <div className="flex justify-between text-sm px-4">
                      <span className="text-gray-400">Capital</span>
                      <span className="money">{formatMoney(capital)}</span>
                    </div>
                    {descuentoRenovacion > 0 && (
                      <div className="flex justify-between text-sm px-4">
                        <span className="text-gray-400">Descuento renovacion</span>
                        <span className="text-orange-400 money">- {formatMoney(descuentoRenovacion)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm px-4">
                      <span className="text-gray-400">{feeLabel}</span>
                      <span className="text-amber-400 money">- {formatMoney(feeMonto)}</span>
                    </div>
                    <div className="border-t border-amber-500/30 mt-2 pt-2 flex justify-between text-sm px-4">
                      <span className="font-semibold">Monto a entregar</span>
                      <span className="font-bold text-lg text-white money">{formatMoney(montoFinal)}</span>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                  El {feeLabel.toLowerCase()} se descontara del capital. El cliente recibira{' '}
                  <strong>{formatMoney(montoFinal)}</strong> en lugar de {formatMoney(capital - descuentoRenovacion)}.
                  El credito se activara de inmediato.
                </p>
              </>
            )
          })()}

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
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
              disabled={loading}
              onClick={() => handleActivate('FINANCIADO')}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <BadgePercent className="h-4 w-4" /> Confirmar financiado
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
