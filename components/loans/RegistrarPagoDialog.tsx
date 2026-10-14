'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { CashBreakdownCalculator } from '@/components/payments/CashBreakdownCalculator'
import { formatMoney } from '@/lib/utils'
import {
  Loader2, Banknote, X,
} from 'lucide-react'
import type { CashBreakdownEntry } from '@/types'

interface RegistrarPagoDialogProps {
  loanId: string
  open: boolean
  onClose: () => void
  feeConcepto: 'SEGURO' | 'COMISION'
  feeMonto: number
  capital: number
  descuentoRenovacion?: number
}

// Comisión / seguro de apertura: desde 2026-10 por decisión de Dirección,
// SOLO se cobra en efectivo con ticket. Se removieron CARD, TRANSFER y
// FINANCIADO (ya no se descuenta del capital).
type Step = 'menu' | 'cash'

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

  if (!open) return null

  const feeLabel = feeConcepto === 'SEGURO' ? 'Seguro de apertura' : 'Comisión de apertura'

  function handleClose() {
    if (loading) return
    setStep('menu')
    onClose()
  }

  async function handleRegister(
    metodoPago: 'CASH',
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

      const res = await fetch(`/api/loans/${loanId}/register-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al registrar el pago')
      toast({ title: 'Pago de comisión registrado' })
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

            {/* Decisión Dirección 2026-10: la comisión / seguro de
                apertura se cobra únicamente en EFECTIVO con ticket. Se
                eliminaron las opciones de Tarjeta, Transferencia y
                Financiado (ya no se descuenta del capital). */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">Método de pago</p>
              <div className="grid grid-cols-1 gap-3">
                <button
                  type="button"
                  onClick={() => setStep('cash')}
                  className="flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-primary-400 bg-primary-500/10 hover:bg-primary-500/20 transition-colors"
                >
                  <Banknote className="h-7 w-7 text-primary-400" />
                  <span className="font-semibold text-sm">Pagar en efectivo</span>
                </button>
              </div>
              <p className="text-[11px] text-amber-300/80 mt-2 text-center">
                La comisión de apertura se cobra únicamente en efectivo
                con ticket impreso.
              </p>
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

        {/* Nota: pasos CARD / TRANSFER / FINANCIADO fueron removidos en
            2026-10 (Dirección) — la comisión / seguro de apertura se
            cobra únicamente en efectivo con ticket. */}
      </div>
    </div>
  )
}
