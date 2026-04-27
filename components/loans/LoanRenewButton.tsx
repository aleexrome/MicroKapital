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

interface PagoFinanciable {
  id: string
  numeroPago: number
  montoEsperado: number
}

interface LoanRenewButtonProps {
  loanId: string
  tipo: LoanType
  pagosRealizados: number
  umbral: number
  // Los últimos N pagos pendientes que la empresa permite financiar para
  // este producto (SOLIDARIO=2, INDIVIDUAL=3, AGIL=4). El coordinador
  // puede destildar para financiar menos, pero el componente nunca
  // permite seleccionar más de los que recibe (eso es el máximo).
  pagosFinanciables: PagoFinanciable[]
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
  pagosFinanciables,
}: LoanRenewButtonProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [capital, setCapital] = useState('')
  // Default: todos los pagos financiables marcados (los últimos N).
  // El coordinador puede destildar para financiar menos.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(pagosFinanciables.map((p) => p.id))
  )

  const selectedPagos = pagosFinanciables.filter((p) => selectedIds.has(p.id))
  const montoFinanciado = selectedPagos.reduce((s, p) => s + p.montoEsperado, 0)
  const pagosFinanciadosCount = selectedPagos.length
  const totalEsperadoMaximo = pagosFinanciables.length

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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
        body: JSON.stringify({
          capital: cap,
          // Mandamos siempre, aunque sea array vacío (= no financiar
          // nada). El backend respeta lo que llegue; solo cae a auto-fin
          // cuando el campo no viene.
          pagosFinanciadosIds: Array.from(selectedIds),
        }),
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
    <Card className="border-2 border-orange-500 bg-green-50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2 text-green-800">
            <RefreshCw className="h-4 w-4" />
            Renovación Anticipada Disponible
          </span>
          <div className="flex items-center gap-2">
            <Badge variant="success">{pagosRealizados}/{pagosRealizados + totalEsperadoMaximo} pagos</Badge>
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
                  Puedes financiar hasta los últimos <strong>{totalEsperadoMaximo} pagos</strong> del crédito actual.
                  Destilda los que NO quieras financiar.
                </p>
              </div>
            </div>
          </div>

          {/* Selección de pagos a financiar */}
          {pagosFinanciables.length > 0 && (
            <div className="bg-white rounded-lg p-3 border border-green-100 text-sm space-y-2">
              <p className="font-medium text-gray-700">Pagos a financiar</p>
              <div className="space-y-1">
                {pagosFinanciables.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-2 py-1"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={() => toggle(p.id)}
                      className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
                    />
                    <span className="flex-1 text-gray-700">Pago {p.numeroPago}</span>
                    <span className="font-medium text-gray-900">{formatMoney(p.montoEsperado)}</span>
                  </label>
                ))}
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-100 text-sm">
                <span className="text-muted-foreground">
                  {pagosFinanciadosCount} de {totalEsperadoMaximo} pagos seleccionados
                </span>
                <span className="font-semibold text-orange-600">{formatMoney(montoFinanciado)}</span>
              </div>
            </div>
          )}

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
