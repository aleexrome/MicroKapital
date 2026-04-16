'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatMoney } from '@/lib/utils'
import { calcLoan } from '@/lib/financial-formulas'
import type { LoanCalculation } from '@/types'

interface LoanCalculatorProps {
  tipo: 'SOLIDARIO' | 'INDIVIDUAL' | 'AGIL' | 'FIDUCIARIO'
  capital: number
  tasaInteres?: number
  ciclo?: number
  tuvoAtraso?: boolean
  clienteIrregular?: boolean
  tipoGrupo?: 'REGULAR' | 'RESCATE'
  onCalc?: (calc: LoanCalculation) => void
}

export function LoanCalculator({
  tipo, capital, tasaInteres, ciclo, tuvoAtraso, clienteIrregular, tipoGrupo, onCalc,
}: LoanCalculatorProps) {
  const [calc, setCalc] = useState<LoanCalculation | null>(null)

  useEffect(() => {
    if (!capital || capital <= 0) { setCalc(null); return }

    const result = calcLoan(tipo, capital, tasaInteres, {
      ciclo, tuvoAtraso, clienteIrregular, tipoGrupo,
    })
    setCalc(result)
    onCalc?.(result)
  }, [tipo, capital, tasaInteres, ciclo, tuvoAtraso, clienteIrregular, tipoGrupo, onCalc])

  if (!calc || capital <= 0) return null

  const plazoLabel =
    tipo === 'AGIL' ? 'días hábiles' :
    tipo === 'FIDUCIARIO' ? 'quincenas' :
    'semanas'

  const rows = [
    { label: 'Capital solicitado', value: formatMoney(calc.capital) },
    ...(calc.comision > 0 ? [{
      label: tipo === 'FIDUCIARIO'
        ? 'Comisión apertura (10%)'
        : `Comisión (${tipo === 'INDIVIDUAL' ? `${Math.round(calc.comision / calc.capital * 100)}%` : '10%'})`,
      value: `- ${formatMoney(calc.comision)}`,
    }] : []),
    ...(calc.montoReal !== calc.capital ? [{
      label: 'Monto a entregar al cliente',
      value: formatMoney(calc.montoReal),
      highlight: true,
    }] : []),
    { label: 'Interés', value: formatMoney(calc.interes) },
    { label: 'Total a pagar', value: formatMoney(calc.totalPago), bold: true },
    { label: 'Plazo', value: `${calc.plazo} ${plazoLabel}` },
    ...(calc.pagoSemanal ? [{ label: 'Pago semanal', value: formatMoney(calc.pagoSemanal), highlight: true }] : []),
    ...(calc.pagoDiario ? [{ label: 'Pago diario', value: formatMoney(calc.pagoDiario), highlight: true }] : []),
    ...(calc.pagoQuincenal ? [{ label: 'Pago quincenal', value: formatMoney(calc.pagoQuincenal), highlight: true }] : []),
  ]

  return (
    <Card className="border-primary-500/30 bg-primary-500/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-primary-400">Resumen del préstamo</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-primary-500/20">
          {rows.map((row, i) => (
            <div
              key={i}
              className={`flex justify-between py-1.5 text-sm ${
                row.bold ? 'font-bold text-primary-300' : ''
              } ${row.highlight ? 'text-white font-semibold' : 'text-gray-400'}`}
            >
              <span>{row.label}</span>
              <span className="money">{row.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
