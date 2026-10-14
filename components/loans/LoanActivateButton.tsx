'use client'

import { useState } from 'react'
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
} from 'lucide-react'
import type { CashBreakdownEntry } from '@/types'

interface LoanActivateButtonProps {
  loanId: string
  seguroPendiente?: boolean
  fechaDesembolsoDG?: string | null
  fechaPrimerPagoDG?: string | null
  feeConcepto: 'SEGURO' | 'COMISION'
  feeMonto: number
  capital: number
  descuentoRenovacion?: number
}

// Comisión / seguro de apertura: desde 2026-10 por decisión de Dirección,
// SOLO se cobra en efectivo con ticket. Se removieron CARD, TRANSFER y
// FINANCIADO. El Step type queda minimalista.
type Step = 'info' | 'cash'

export function LoanActivateButton({
  loanId,
  seguroPendiente = false,
  fechaDesembolsoDG,
  fechaPrimerPagoDG,
  feeConcepto,
  feeMonto,
  capital,
  descuentoRenovacion = 0,
}: LoanActivateButtonProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [step, setStep] = useState<Step>('info')

  const feeLabel = feeConcepto === 'SEGURO' ? 'Seguro de apertura' : 'Comision de apertura'

  async function handleActivate(
    metodoPago: 'CASH',
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
        if (metodoPago === 'CASH' && data.ticket?.id) {
          router.push(`/thermal-print?ticketId=${data.ticket.id}`)
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
            <p className="text-xs text-muted-foreground mb-2">Método de pago</p>
            {/* Comisión / seguro de apertura: SOLO en efectivo, con ticket.
                Decisión de Dirección (2026-10): ya no se descuenta del
                capital (FINANCIADO deshabilitado) y no se acepta
                TRANSFER ni CARD en la comisión — se cobra siempre en
                efectivo para que quede ticket físico de respaldo. */}
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

      {/* Nota: pasos CARD / TRANSFER / FINANCIADO fueron removidos en
          2026-10 (Dirección) — la comisión / seguro de apertura se cobra
          únicamente en efectivo con ticket. Si en el futuro se abre
          nuevamente alguno de esos canales, revivir desde el histórico. */}
    </div>
  )
}
