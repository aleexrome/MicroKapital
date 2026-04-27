'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { RefreshCw, Loader2, ChevronDown, ChevronUp, Info } from 'lucide-react'
import { formatMoney } from '@/lib/utils'
import type { LoanType } from '@prisma/client'

interface LoanRenewButtonProps {
  loanId: string
  tipo: LoanType
  pagosRealizados: number
  umbral: number
  pagosFinanciados: number
  montoFinanciado: number
  clientId: string
  clientNombre: string
  cobradorId: string
  branchId: string
}

const TIPO_LABELS: Record<LoanType, string> = {
  SOLIDARIO: 'Solidario',
  INDIVIDUAL: 'Individual',
  AGIL: 'Ágil',
  FIDUCIARIO: 'Fiduciario',
}

export function LoanRenewButton({
  loanId,
  tipo,
  pagosRealizados,
  umbral,
  pagosFinanciados,
  montoFinanciado,
}: LoanRenewButtonProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [capital, setCapital] = useState('')

  async function handleRenew() {
    const cap = parseFloat(capital)
    if (!cap || cap <= 0) {
      toast({ title: 'Ingresa el capital del nuevo crédito', variant: 'destructive' })
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/loans/${loanId}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capital: cap }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al renovar')

      toast({
        title: '✅ Renovación creada',
        description: `Monto financiado: ${formatMoney(data.data.montoFinanciado)} · Entregado al cliente: ${formatMoney(data.data.montoRealEntregado)}`,
      })
      router.push(`/prestamos/${data.data.nuevoLoanId}`)
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="border-green-200 bg-green-50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2 text-green-800">
            <RefreshCw className="h-4 w-4" />
            Renovación Anticipada Disponible
          </span>
          <div className="flex items-center gap-2">
            <Badge variant="success">{pagosRealizados}/{pagosRealizados + pagosFinanciados} pagos</Badge>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setOpen(!open)}>
              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>

      {open && (
        <CardContent className="space-y-4">
          {/* Información del financiamiento */}
          <div className="bg-white rounded-lg p-3 border border-green-100 text-sm space-y-1">
            <div className="flex items-start gap-2 text-green-700">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Crédito {TIPO_LABELS[tipo]} · Renovación desde pago {umbral}</p>
                <p className="text-muted-foreground mt-1">
                  La empresa financia los últimos <strong>{pagosFinanciados} pagos</strong> del crédito actual
                  ({formatMoney(montoFinanciado)}) y los descuenta del nuevo crédito.
                </p>
              </div>
            </div>
          </div>

          {/* Formulario del nuevo crédito */}
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Capital del nuevo crédito</label>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-muted-foreground">$</span>
                <input
                  type="number"
                  min="1"
                  step="500"
                  placeholder="Ej. 10000"
                  value={capital}
                  onChange={(e) => setCapital(e.target.value)}
                  className="border rounded px-3 py-1.5 text-sm flex-1 max-w-xs"
                />
              </div>
            </div>

            {capital && parseFloat(capital) > 0 && (
              <div className="bg-blue-50 rounded p-3 text-sm border border-blue-100">
                <p className="font-medium text-blue-800 mb-1">Resumen de la renovación</p>
                <div className="space-y-0.5 text-blue-700">
                  <p>Capital solicitado: <strong>{formatMoney(parseFloat(capital))}</strong></p>
                  <p>Monto financiado (descuento): <strong className="text-orange-600">-{formatMoney(montoFinanciado)}</strong></p>
                  <p>Entregado al cliente: <strong>{formatMoney(Math.max(0, parseFloat(capital) - montoFinanciado))}</strong>*</p>
                  <p className="text-xs text-muted-foreground mt-1">* La comisión exacta se descuenta al activar el crédito.</p>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white"
                disabled={loading || !capital}
                onClick={handleRenew}
              >
                {loading
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <><RefreshCw className="h-4 w-4 mr-1" />Crear renovación</>
                }
              </Button>
              <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
