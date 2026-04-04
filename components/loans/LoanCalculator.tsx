'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatMoney } from '@/lib/utils'
import type { LoanCalculation } from '@/types'

interface LoanCalculatorProps {
  tipo: 'SOLIDARIO' | 'INDIVIDUAL' | 'AGIL'
  capital: number
  tasaInteres: number
  onCalc?: (calc: LoanCalculation) => void
}

export function LoanCalculator({ tipo, capital, tasaInteres, onCalc }: LoanCalculatorProps) {
  const [calc, setCalc] = useState<LoanCalculation | null>(null)

  useEffect(() => {
    if (!capital || capital <= 0) {
      setCalc(null)
      return
    }

    // Calcular según tipo
    let result: LoanCalculation

    if (tipo === 'SOLIDARIO') {
      const interes = capital * tasaInteres
      const totalPago = capital + interes
      result = {
        capital,
        tasaInteres,
        comision: 0,
        montoReal: capital,
        interes,
        totalPago,
        pagoSemanal: totalPago / 8,
        plazo: 8,
      }
    } else if (tipo === 'INDIVIDUAL') {
      const comision = capital * 0.17
      const montoReal = capital - comision
      const interes = capital * tasaInteres
      const totalPago = capital + interes
      result = {
        capital,
        tasaInteres,
        comision,
        montoReal,
        interes,
        totalPago,
        pagoSemanal: totalPago / 12,
        plazo: 12,
      }
    } else {
      // AGIL
      const interes = capital * 0.56
      const totalPago = capital + interes
      result = {
        capital,
        tasaInteres: 0.56,
        comision: 0,
        montoReal: capital,
        interes,
        totalPago,
        pagoDiario: totalPago / 24,
        plazo: 24,
      }
    }

    setCalc(result)
    onCalc?.(result)
  }, [tipo, capital, tasaInteres, onCalc])

  if (!calc || capital <= 0) return null

  const rows = [
    { label: 'Capital solicitado', value: formatMoney(calc.capital) },
    ...(calc.comision > 0 ? [{ label: 'Comisión (17%)', value: `- ${formatMoney(calc.comision)}` }] : []),
    ...(calc.montoReal !== calc.capital ? [{ label: 'Monto a entregar', value: formatMoney(calc.montoReal), highlight: true }] : []),
    { label: 'Interés', value: formatMoney(calc.interes) },
    { label: 'Total a pagar', value: formatMoney(calc.totalPago), bold: true },
    { label: 'Plazo', value: `${calc.plazo} ${tipo === 'AGIL' ? 'días hábiles' : 'semanas'}` },
    ...(calc.pagoSemanal ? [{ label: 'Pago semanal', value: formatMoney(calc.pagoSemanal), highlight: true }] : []),
    ...(calc.pagoDiario ? [{ label: 'Pago diario', value: formatMoney(calc.pagoDiario), highlight: true }] : []),
  ]

  return (
    <Card className="border-primary-200 bg-primary-50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-primary-700">Resumen del préstamo</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-primary-100">
          {rows.map((row, i) => (
            <div
              key={i}
              className={`flex justify-between py-1.5 text-sm ${
                row.bold ? 'font-bold text-primary-800' : ''
              } ${row.highlight ? 'text-primary-700 font-semibold' : 'text-gray-700'}`}
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
