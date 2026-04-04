'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/utils'
import { CheckCircle, XCircle, MinusCircle, PlusCircle } from 'lucide-react'
import type { CashBreakdownEntry } from '@/types'

interface Denomination {
  value: number
  label: string
  tipo: 'billete' | 'moneda'
}

const DENOMINATIONS: Denomination[] = [
  { value: 1000, label: '$1,000', tipo: 'billete' },
  { value: 500,  label: '$500',   tipo: 'billete' },
  { value: 200,  label: '$200',   tipo: 'billete' },
  { value: 100,  label: '$100',   tipo: 'billete' },
  { value: 50,   label: '$50',    tipo: 'billete' },
  { value: 20,   label: '$20',    tipo: 'billete' },
  { value: 10,   label: '$10',    tipo: 'moneda' },
  { value: 5,    label: '$5',     tipo: 'moneda' },
  { value: 2,    label: '$2',     tipo: 'moneda' },
  { value: 1,    label: '$1',     tipo: 'moneda' },
]

interface CashBreakdownCalculatorProps {
  montoEsperado: number
  onConfirm: (breakdown: CashBreakdownEntry[], cambio: number) => void
  onCancel: () => void
  disabled?: boolean
}

export function CashBreakdownCalculator({
  montoEsperado,
  onConfirm,
  onCancel,
  disabled = false,
}: CashBreakdownCalculatorProps) {
  const [counts, setCounts] = useState<Record<number, number>>(
    Object.fromEntries(DENOMINATIONS.map((d) => [d.value, 0]))
  )

  const totalRecibido = useMemo(
    () => DENOMINATIONS.reduce((sum, d) => sum + d.value * (counts[d.value] ?? 0), 0),
    [counts]
  )

  const cambio = totalRecibido - montoEsperado
  const falta = montoEsperado - totalRecibido
  const puedeConfirmar = totalRecibido >= montoEsperado && !disabled

  function increment(value: number) {
    setCounts((prev) => ({ ...prev, [value]: (prev[value] ?? 0) + 1 }))
  }

  function decrement(value: number) {
    setCounts((prev) => ({ ...prev, [value]: Math.max(0, (prev[value] ?? 0) - 1) }))
  }

  function handleCountInput(value: number, raw: string) {
    const n = parseInt(raw, 10)
    setCounts((prev) => ({ ...prev, [value]: isNaN(n) || n < 0 ? 0 : n }))
  }

  function handleConfirm() {
    const breakdown: CashBreakdownEntry[] = DENOMINATIONS.filter(
      (d) => (counts[d.value] ?? 0) > 0
    ).map((d) => ({
      denominacion: d.value,
      cantidad: counts[d.value],
      subtotal: d.value * counts[d.value],
    }))
    onConfirm(breakdown, Math.max(0, cambio))
  }

  const billetes = DENOMINATIONS.filter((d) => d.tipo === 'billete')
  const monedas = DENOMINATIONS.filter((d) => d.tipo === 'moneda')

  return (
    <div className="space-y-4">
      {/* Monto a cobrar */}
      <div className="bg-primary-700 text-white rounded-lg p-4 text-center">
        <p className="text-sm opacity-80">MONTO A COBRAR</p>
        <p className="text-3xl font-bold money">{formatMoney(montoEsperado)}</p>
      </div>

      {/* Billetes */}
      <DenomGroup title="BILLETES" items={billetes} counts={counts} onIncrement={increment} onDecrement={decrement} onInput={handleCountInput} />

      {/* Monedas */}
      <DenomGroup title="MONEDAS" items={monedas} counts={counts} onIncrement={increment} onDecrement={decrement} onInput={handleCountInput} />

      {/* Resumen */}
      <div className="rounded-lg border-2 border-gray-200 divide-y">
        <div className="flex justify-between items-center px-4 py-3">
          <span className="text-sm text-muted-foreground">Total recibido</span>
          <span className="font-bold text-lg money">{formatMoney(totalRecibido)}</span>
        </div>
        <div className="flex justify-between items-center px-4 py-3">
          <span className="text-sm text-muted-foreground">Monto a cobrar</span>
          <span className="font-medium money">{formatMoney(montoEsperado)}</span>
        </div>
        <div className={`flex justify-between items-center px-4 py-3 ${
          totalRecibido < montoEsperado
            ? 'bg-red-50'
            : cambio > 0
            ? 'bg-green-50'
            : 'bg-gray-50'
        }`}>
          {totalRecibido < montoEsperado ? (
            <>
              <span className="text-sm font-semibold text-red-600 flex items-center gap-1">
                <XCircle className="h-4 w-4" /> Falta
              </span>
              <span className="font-bold text-red-600 money">{formatMoney(falta)}</span>
            </>
          ) : cambio > 0 ? (
            <>
              <span className="text-sm font-semibold text-green-700 flex items-center gap-1">
                <CheckCircle className="h-4 w-4" /> Cambio a entregar
              </span>
              <span className="font-bold text-green-700 money">{formatMoney(cambio)}</span>
            </>
          ) : (
            <>
              <span className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                <CheckCircle className="h-4 w-4" /> Exacto
              </span>
              <span className="font-bold text-gray-700">$0.00</span>
            </>
          )}
        </div>
      </div>

      {/* Botones */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={onCancel} className="flex-1" disabled={disabled}>
          Cancelar
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={!puedeConfirmar}
          className="flex-1"
          variant={puedeConfirmar ? 'default' : 'secondary'}
        >
          <CheckCircle className="h-4 w-4" />
          {!puedeConfirmar && totalRecibido < montoEsperado
            ? `Falta ${formatMoney(falta)}`
            : 'Confirmar pago'}
        </Button>
      </div>
    </div>
  )
}

function DenomGroup({
  title,
  items,
  counts,
  onIncrement,
  onDecrement,
  onInput,
}: {
  title: string
  items: Denomination[]
  counts: Record<number, number>
  onIncrement: (v: number) => void
  onDecrement: (v: number) => void
  onInput: (v: number, raw: string) => void
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground mb-2 tracking-wider">{title}</p>
      <div className="space-y-1.5">
        {items.map((d) => {
          const qty = counts[d.value] ?? 0
          const subtotal = d.value * qty
          return (
            <div key={d.value} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${qty > 0 ? 'bg-primary-50 border border-primary-200' : 'bg-gray-50'}`}>
              {/* Denominación */}
              <span className="w-14 text-sm font-medium text-right tabular-nums">{d.label}</span>

              {/* Controles */}
              <button
                type="button"
                onClick={() => onDecrement(d.value)}
                className="text-gray-400 hover:text-red-500 transition-colors"
                disabled={qty === 0}
              >
                <MinusCircle className="h-5 w-5" />
              </button>

              <input
                type="number"
                min="0"
                value={qty === 0 ? '' : qty}
                onChange={(e) => onInput(d.value, e.target.value)}
                placeholder="0"
                className="w-14 text-center text-sm font-semibold border rounded-md py-1 focus:outline-none focus:ring-2 focus:ring-primary-500 tabular-nums"
              />

              <button
                type="button"
                onClick={() => onIncrement(d.value)}
                className="text-gray-400 hover:text-primary-600 transition-colors"
              >
                <PlusCircle className="h-5 w-5" />
              </button>

              {/* Subtotal */}
              <span className={`ml-auto text-sm tabular-nums ${qty > 0 ? 'font-semibold text-primary-700' : 'text-muted-foreground'}`}>
                {qty > 0 ? formatMoney(subtotal) : '—'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
