'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { CashBreakdownCalculator } from '@/components/payments/CashBreakdownCalculator'
import { formatMoney } from '@/lib/utils'
import {
  Loader2, Banknote, CreditCard, Building2, BadgePercent,
  CheckCircle, X,
} from 'lucide-react'
import type { CashBreakdownEntry } from '@/types'

interface BankAccount {
  id: string
  banco: string
  titular: string
  clabe: string
}

interface RegistrarPagoDialogProps {
  loanId: string
  open: boolean
  onClose: () => void
  feeConcepto: 'SEGURO' | 'COMISION'
  feeMonto: number
  capital: number
  descuentoRenovacion?: number
}

type Step = 'menu' | 'cash' | 'card' | 'transfer' | 'financiado'

/**
 * Modal del candado 2 del flujo de activación. Llama a
 * /api/loans/[id]/register-payment con el método elegido.
 *
 * Está basado 1:1 en el patrón de LoanActivateButton (Fase 5) — misma UI
 * de selección de método, mismo CashBreakdownCalculator, misma carga de
 * cuentas bancarias. La diferencia está en el endpoint y en que esto vive
 * como modal interactivo dentro del candado, no como botón principal.
 */
export function RegistrarPagoDialog({
  loanId,
  open,
  onClose,
  feeConcepto,
  feeMonto,
  capital,
  descuentoRenovacion = 0,
}: RegistrarPagoDialogProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [step, setStep] = useState<Step>('menu')
  const [loading, setLoading] = useState(false)

  // Transferencia
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState('')
  const [idTransferencia, setIdTransferencia] = useState('')

  useEffect(() => {
    if (!open) return
    fetch('/api/bank-accounts')
      .then((r) => r.json())
      .then((d) => {
        if (d.data?.length) {
          setBankAccounts(d.data)
          setSelectedAccount(d.data[0].id)
        }
      })
      .catch(() => {})
  }, [open])

  if (!open) return null

  const feeLabel = feeConcepto === 'SEGURO' ? 'Seguro de apertura' : 'Comisión de apertura'

  function handleClose() {
    if (loading) return
    setStep('menu')
    setIdTransferencia('')
    onClose()
  }

  async function handleRegister(
    metodoPago: 'CASH' | 'CARD' | 'TRANSFER' | 'FINANCIADO',
    cashBreakdown?: CashBreakdownEntry[],
    cambioEntregado?: number,
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

      const res = await fetch(`/api/loans/${loanId}/register-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al registrar el pago')

      if (data.seguroPendiente) {
        toast({
          title: 'Pago registrado por transferencia',
          description: 'Pendiente de verificación por el Gerente Zonal.',
        })
      } else {
        toast({ title: 'Pago de comisión registrado' })
      }

      onClose()
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-card border border-border/60 shadow-card p-5 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h3 className="text-base font-semibold">Registrar pago de {feeLabel.toLowerCase()}</h3>
          <button
            onClick={handleClose}
            disabled={loading}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Step: menú principal de métodos ─────────────────────────────── */}
        {step === 'menu' && (
          <div className="space-y-4">
            <div className="bg-primary-500/10 border border-primary-500/30 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">{feeLabel}</p>
              <p className="text-2xl font-bold text-primary-400 money">
                {formatMoney(feeMonto)}
              </p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-2">Método de pago</p>
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

            <Button variant="outline" onClick={handleClose} className="w-full">
              Cancelar
            </Button>
          </div>
        )}

        {/* ── Step: CASH ───────────────────────────────────────────────────── */}
        {step === 'cash' && (
          <CashBreakdownCalculator
            montoEsperado={feeMonto}
            disabled={loading}
            onCancel={() => setStep('menu')}
            onConfirm={(breakdown, cambio) => handleRegister('CASH', breakdown, cambio)}
          />
        )}

        {/* ── Step: CARD ───────────────────────────────────────────────────── */}
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
              <Button variant="outline" className="flex-1" disabled={loading} onClick={() => setStep('menu')}>
                Atrás
              </Button>
              <Button className="flex-1" disabled={loading} onClick={() => handleRegister('CARD')}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle className="h-4 w-4" /> Confirmar</>}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step: TRANSFER ──────────────────────────────────────────────── */}
        {step === 'transfer' && (
          <div className="space-y-4">
            <div className="bg-primary-500/10 border border-primary-500/30 rounded-lg p-4 text-center">
              <Building2 className="h-8 w-8 text-primary-400 mx-auto mb-2" />
              <p className="font-medium">Transferencia bancaria</p>
              <p className="text-2xl font-bold text-primary-400 money mt-1">
                {formatMoney(feeMonto)}
              </p>
            </div>

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
                className="w-full border border-gray-600 bg-gray-800 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Número de referencia..."
                value={idTransferencia}
                onChange={(e) => setIdTransferencia(e.target.value)}
              />
            </div>

            <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              El candado 2 quedará pendiente. El Gerente Zonal debe verificar que el dinero llegó a la cuenta para que el flujo continúe.
            </p>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" disabled={loading} onClick={() => setStep('menu')}>
                Atrás
              </Button>
              <Button className="flex-1" disabled={loading} onClick={() => handleRegister('TRANSFER')}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle className="h-4 w-4" /> Registrar</>}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step: FINANCIADO ────────────────────────────────────────────── */}
        {step === 'financiado' && (() => {
          const montoFinal = capital - descuentoRenovacion - feeMonto
          return (
            <div className="space-y-4">
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
                      <span className="text-gray-400">Descuento renovación</span>
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
                El {feeLabel.toLowerCase()} se descontará del capital. El cliente recibirá <strong>{formatMoney(montoFinal)}</strong> al firmar el desembolso.
              </p>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" disabled={loading} onClick={() => setStep('menu')}>
                  Atrás
                </Button>
                <Button
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                  disabled={loading}
                  onClick={() => handleRegister('FINANCIADO')}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><BadgePercent className="h-4 w-4" /> Confirmar financiado</>}
                </Button>
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
