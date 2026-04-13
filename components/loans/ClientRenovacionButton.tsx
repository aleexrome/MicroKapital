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

export interface PagoPendiente {
  id: string
  numeroPago: number
  montoEsperado: number
}

interface ClientRenovacionButtonProps {
  loanId: string
  tipo: LoanType
  pagosRealizados: number
  umbral: number
  pagosPendientes: PagoPendiente[]
}

const TIPO_LABELS: Record<LoanType, string> = {
  SOLIDARIO: 'Solidario',
  INDIVIDUAL: 'Individual',
  AGIL: 'Ágil',
  FIDUCIARIO: 'Fiduciario',
}

const TIPOS: LoanType[] = ['SOLIDARIO', 'INDIVIDUAL', 'AGIL', 'FIDUCIARIO']

export function ClientRenovacionButton({
  loanId,
  tipo,
  pagosRealizados,
  umbral,
  pagosPendientes,
}: ClientRenovacionButtonProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [capital, setCapital] = useState('')
  const [nuevoTipo, setNuevoTipo] = useState<LoanType>(tipo)
  const [notas, setNotas] = useState('')
  const [selectedPagos, setSelectedPagos] = useState<Set<string>>(
    () => new Set(pagosPendientes.map((p) => p.id))
  )

  const pagosSeleccionados = pagosPendientes.filter((p) => selectedPagos.has(p.id))
  const montoFinanciado = pagosSeleccionados.reduce((sum, p) => sum + p.montoEsperado, 0)
  const capitalNum = parseFloat(capital) || 0
  const montoEntregado = Math.max(0, capitalNum - montoFinanciado)
  const totalPagos = pagosRealizados + pagosPendientes.length

  function togglePago(id: string) {
    setSelectedPagos((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleRenew() {
    if (!capital || capitalNum <= 0) {
      toast({ title: 'Ingresa el capital del nuevo crédito', variant: 'destructive' })
      return
    }
    if (selectedPagos.size === 0) {
      toast({ title: 'Selecciona al menos un pago a financiar', variant: 'destructive' })
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/loans/${loanId}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          capital: capitalNum,
          tipo: nuevoTipo !== tipo ? nuevoTipo : undefined,
          pagosFinanciadosIds: Array.from(selectedPagos),
          notas: notas.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al solicitar renovación')

      toast({
        title: '✅ Solicitud de renovación creada',
        description: `Financiado: ${formatMoney(data.data.montoFinanciado)} · Pendiente de aprobación del Director General`,
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
            <Badge variant="success">{pagosRealizados}/{totalPagos} pagos</Badge>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setOpen(!open)}>
              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>

      {open && (
        <CardContent className="space-y-4">
          {/* Info */}
          <div className="bg-white rounded-lg p-3 border border-green-100 text-sm">
            <div className="flex items-start gap-2 text-green-700">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <p>
                Crédito <strong>{TIPO_LABELS[tipo]}</strong> elegible desde pago {umbral}.
                Selecciona los pagos pendientes que se financiarán con el nuevo crédito — el monto
                se descuenta del capital entregado al cliente.
              </p>
            </div>
          </div>

          {/* Pagos a financiar */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">
              Pagos pendientes a financiar ({pagosPendientes.length})
            </p>
            <div className="space-y-1.5 bg-white rounded-lg border border-green-100 p-2">
              {pagosPendientes.map((p) => (
                <label key={p.id} className="flex items-center gap-3 cursor-pointer px-1 py-0.5 hover:bg-green-50 rounded">
                  <input
                    type="checkbox"
                    checked={selectedPagos.has(p.id)}
                    onChange={() => togglePago(p.id)}
                    className="rounded"
                  />
                  <span className="text-sm flex-1">Pago #{p.numeroPago}</span>
                  <span className="text-sm font-medium">{formatMoney(p.montoEsperado)}</span>
                </label>
              ))}
              {pagosSeleccionados.length > 0 && (
                <div className="flex justify-between items-center px-1 pt-1.5 border-t text-sm">
                  <span className="text-muted-foreground">Total financiado</span>
                  <span className="font-semibold text-orange-600">-{formatMoney(montoFinanciado)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Tipo de nuevo crédito */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Tipo de nuevo crédito</p>
            <div className="flex flex-wrap gap-2">
              {TIPOS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setNuevoTipo(t)}
                  className={`px-3 py-1.5 rounded border text-sm font-medium transition-colors ${
                    nuevoTipo === t
                      ? 'bg-green-700 text-white border-green-700'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-green-500'
                  }`}
                >
                  {TIPO_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Capital */}
          <div>
            <label className="text-sm font-medium text-gray-700">Capital del nuevo crédito</label>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-muted-foreground">$</span>
              <input
                type="number"
                min="1"
                step="500"
                placeholder="Ej. 5000"
                value={capital}
                onChange={(e) => setCapital(e.target.value)}
                className="border rounded px-3 py-1.5 text-sm flex-1 max-w-xs"
              />
            </div>
          </div>

          {/* Notas opcionales */}
          <div>
            <label className="text-sm font-medium text-gray-700">
              Notas adicionales <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <textarea
              rows={2}
              className="mt-1 border rounded px-3 py-1.5 text-sm w-full resize-none"
              placeholder="Indicaciones o contexto de la renovación..."
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
          </div>

          {/* Resumen */}
          {capitalNum > 0 && (
            <div className="bg-blue-50 rounded p-3 text-sm border border-blue-100">
              <p className="font-medium text-blue-800 mb-1.5">Resumen de la solicitud</p>
              <div className="space-y-0.5 text-blue-700">
                <div className="flex justify-between">
                  <span>Capital solicitado</span>
                  <strong>{formatMoney(capitalNum)}</strong>
                </div>
                {montoFinanciado > 0 && (
                  <div className="flex justify-between">
                    <span>Descuento ({pagosSeleccionados.length} pago{pagosSeleccionados.length !== 1 ? 's' : ''})</span>
                    <strong className="text-orange-600">-{formatMoney(montoFinanciado)}</strong>
                  </div>
                )}
                <div className="flex justify-between border-t pt-0.5 mt-1">
                  <span className="font-medium">Estimado a recibir</span>
                  <strong>{formatMoney(montoEntregado)}</strong>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  * El monto exacto se confirma al activar (incluye comisión si aplica)
                </p>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={loading || capitalNum <= 0 || selectedPagos.size === 0}
              onClick={handleRenew}
            >
              {loading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <><RefreshCw className="h-4 w-4 mr-1" />Solicitar renovación</>
              }
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
