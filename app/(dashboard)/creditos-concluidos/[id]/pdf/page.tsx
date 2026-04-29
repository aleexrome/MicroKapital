'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { formatMoney, formatDate, formatDateTime } from '@/lib/utils'
import { ArrowLeft, Download, Loader2 } from 'lucide-react'

interface LoanReport {
  id: string
  tipo: string
  capital: number
  comision: number
  montoReal: number
  tasaInteres: number
  interes: number
  totalPago: number
  pagoSemanal: number | null
  pagoDiario: number | null
  pagoQuincenal: number | null
  plazo: number
  fechaDesembolso: string | null
  createdAt: string
  updatedAt: string
  client: { nombreCompleto: string; telefono: string | null; domicilio: string | null }
  cobrador: { nombre: string }
  branch: { nombre: string }
  company: { nombre: string }
  schedule: {
    numeroPago: number
    fechaVencimiento: string
    montoEsperado: number
    montoPagado: number
    estado: string
    pagadoAt: string | null
  }[]
  payments: {
    id: string
    monto: number
    metodoPago: string
    fechaHora: string
    tickets: { numeroTicket: string }[]
  }[]
  /** Marca del API: true si el rol del usuario no puede ver desglose de interés */
  _interestHidden?: boolean
}

export default function CreditoPdfPage() {
  const params = useParams()
  const router = useRouter()
  const [loan, setLoan] = useState<LoanReport | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/loans/${params.id}/report`)
      .then((r) => r.json())
      .then(({ data }) => { setLoan(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [params.id])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-8 w-8 animate-spin text-primary-700" />
    </div>
  )

  if (!loan) return (
    <div className="p-6 text-center">
      <p className="text-muted-foreground">No se encontró el crédito</p>
      <Button variant="outline" className="mt-4" onClick={() => router.back()}>Volver</Button>
    </div>
  )

  const totalPagado = loan.payments.reduce((s, p) => s + p.monto, 0)
  const metodoLabel: Record<string, string> = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia' }
  const tipoLabel: Record<string, string> = { SOLIDARIO: 'Solidario', INDIVIDUAL: 'Individual', AGIL: 'Ágil', FIDUCIARIO: 'Fiduciario' }

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { font-size: 12px; }
        }
      `}</style>

      {/* Controls */}
      <div className="no-print flex items-center gap-3 p-4 border-b bg-white sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="font-semibold flex-1">Reporte de crédito concluido</span>
        <Button onClick={() => window.print()}>
          <Download className="h-4 w-4" /> Guardar PDF
        </Button>
      </div>

      {/* Printable content */}
      <div className="p-8 max-w-3xl mx-auto space-y-6 print:p-4">

        {/* Header */}
        <div className="text-center border-b pb-4">
          <h1 className="text-xl font-bold">{loan.company.nombre}</h1>
          <h2 className="text-base font-semibold text-gray-600 mt-1">Reporte de Crédito Concluido</h2>
          <p className="text-sm text-gray-500 mt-0.5">{loan.branch.nombre}</p>
        </div>

        {/* Datos del cliente */}
        <section>
          <h3 className="font-bold text-sm uppercase text-gray-500 mb-2">Datos del cliente</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-gray-500">Nombre: </span><span className="font-medium">{loan.client.nombreCompleto}</span></div>
            <div><span className="text-gray-500">Teléfono: </span><span>{loan.client.telefono ?? '—'}</span></div>
            <div className="col-span-2"><span className="text-gray-500">Domicilio: </span><span>{loan.client.domicilio ?? '—'}</span></div>
          </div>
        </section>

        {/* Datos del crédito */}
        <section>
          <h3 className="font-bold text-sm uppercase text-gray-500 mb-2">Datos del crédito</h3>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div><span className="text-gray-500">Tipo: </span><span className="font-medium">{tipoLabel[loan.tipo]}</span></div>
            <div><span className="text-gray-500">Cobrador: </span><span>{loan.cobrador.nombre}</span></div>
            <div><span className="text-gray-500">Desembolso: </span><span>{loan.fechaDesembolso ? formatDate(loan.fechaDesembolso) : '—'}</span></div>
            <div><span className="text-gray-500">Capital: </span><span className="font-bold">{formatMoney(loan.capital)}</span></div>
            {loan.comision > 0 && <div><span className="text-gray-500">Comisión: </span><span>-{formatMoney(loan.comision)}</span></div>}
            <div><span className="text-gray-500">Entregado: </span><span className="font-bold">{formatMoney(loan.montoReal)}</span></div>
            {!loan._interestHidden && (
              <>
                <div><span className="text-gray-500">Interés: </span><span>{formatMoney(loan.interes)}</span></div>
                <div><span className="text-gray-500">Total pactado: </span><span className="font-bold">{formatMoney(loan.totalPago)}</span></div>
              </>
            )}
            <div><span className="text-gray-500">Total cobrado: </span><span className="font-bold text-green-700">{formatMoney(totalPagado)}</span></div>
          </div>
        </section>

        {/* Tabla de pagos */}
        <section>
          <h3 className="font-bold text-sm uppercase text-gray-500 mb-2">Historial de pagos</h3>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border px-2 py-1 text-left">#</th>
                <th className="border px-2 py-1 text-left">Fecha pactada</th>
                <th className="border px-2 py-1 text-left">Fecha pago</th>
                <th className="border px-2 py-1 text-right">Monto</th>
                <th className="border px-2 py-1 text-center">Método</th>
                <th className="border px-2 py-1 text-left">Ticket</th>
                <th className="border px-2 py-1 text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              {loan.schedule.map((s) => {
                const pago = loan.payments.find((_, i) => i === s.numeroPago - 1) ?? loan.payments[s.numeroPago - 1]
                return (
                  <tr key={s.numeroPago} className={s.numeroPago % 2 === 0 ? 'bg-gray-50' : ''}>
                    <td className="border px-2 py-1">{s.numeroPago}</td>
                    <td className="border px-2 py-1">{formatDate(s.fechaVencimiento)}</td>
                    <td className="border px-2 py-1">{s.pagadoAt ? formatDate(s.pagadoAt) : '—'}</td>
                    <td className="border px-2 py-1 text-right">{formatMoney(Number(s.montoPagado) || Number(s.montoEsperado))}</td>
                    <td className="border px-2 py-1 text-center">{pago ? metodoLabel[pago.metodoPago] ?? pago.metodoPago : '—'}</td>
                    <td className="border px-2 py-1 font-mono text-xs">{pago?.tickets?.[0]?.numeroTicket ?? '—'}</td>
                    <td className="border px-2 py-1 text-center">
                      {s.estado === 'PAID' || s.estado === 'ADVANCE' ? '✅' : s.estado === 'FINANCIADO' ? '🟣' : '⏳'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-100 font-bold">
                <td colSpan={3} className="border px-2 py-1">Total</td>
                <td className="border px-2 py-1 text-right">{formatMoney(totalPagado)}</td>
                <td colSpan={3} className="border px-2 py-1"></td>
              </tr>
            </tfoot>
          </table>
        </section>

        <div className="text-center text-xs text-gray-400 border-t pt-4">
          Generado el {formatDateTime(new Date().toISOString())} · {loan.company.nombre}
        </div>
      </div>
    </>
  )
}
