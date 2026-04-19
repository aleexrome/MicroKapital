'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { TicketPreview } from '@/components/payments/TicketPreview'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Printer, Download, ArrowLeft, Loader2, Bluetooth } from 'lucide-react'
import type { TicketData } from '@/types'
import { buildTicketBytes, printViaBluetooth, loadLogoBitmap } from '@/lib/escpos'

const LOGO_URL = 'https://res.cloudinary.com/djs8dtzrq/image/upload/v1776487061/ddcb6871-4cff-422e-9a00-67d62aa6243f.png'
import { formatMoney } from '@/lib/utils'
import { format } from 'date-fns'

export default function ThermalPrintPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()

  const ticketId = searchParams.get('ticketId')
  const [ticketData, setTicketData] = useState<TicketData | null>(null)
  const [loading, setLoading] = useState(true)
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    if (!ticketId) { setLoading(false); return }

    fetch(`/api/tickets/${ticketId}`)
      .then((r) => r.json())
      .then(({ data }) => {
        if (!data) { setLoading(false); return }

        const p = data.payment
        setTicketData({
          numeroTicket: data.numeroTicket,
          fecha: new Date(data.impresoAt),
          empresa: p.loan.company.nombre,
          sucursal: p.loan.branch.nombre,
          cobrador: p.cobrador.nombre,
          cliente: p.client.nombreCompleto,
          loanId: p.loan.id,
          tipoPrestamo: p.loan.tipo,
          numeroPago: p.schedule?.numeroPago ?? 1,
          totalPagos: p.loan.plazo,
          montoPagado: Number(p.monto),
          metodoPago: p.metodoPago === 'CASH' ? 'Efectivo' : 'Tarjeta',
          recibido: p.metodoPago === 'CASH' ? Number(p.monto) + Number(p.cambioEntregado) : undefined,
          cambio: p.metodoPago === 'CASH' ? Number(p.cambioEntregado) : undefined,
          desglose: p.cashBreakdown,
          qrCode: data.qrCode ?? undefined,
        })
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [ticketId])

  async function handleBluetoothPrint() {
    if (!ticketData) return
    setPrinting(true)
    try {
      // Cargar logo a bitmap (no bloqueante si falla)
      let logo: { pixels: Uint8Array; widthPx: number; heightPx: number } | undefined
      try {
        logo = await loadLogoBitmap(LOGO_URL, 256)
      } catch {
        // seguir sin logo si no se pudo cargar
      }

      const bytes = buildTicketBytes({
        empresa: ticketData.empresa,
        sucursal: ticketData.sucursal,
        numeroTicket: ticketData.numeroTicket,
        fecha: format(new Date(ticketData.fecha), 'dd/MM/yyyy'),
        hora: format(new Date(ticketData.fecha), 'HH:mm'),
        cobrador: ticketData.cobrador,
        cliente: ticketData.cliente,
        tipoPrestamo: ticketData.tipoPrestamo,
        numeroPago: ticketData.numeroPago,
        totalPagos: ticketData.totalPagos,
        montoPagado: formatMoney(ticketData.montoPagado),
        metodoPago: ticketData.metodoPago,
        recibido: ticketData.recibido !== undefined ? formatMoney(ticketData.recibido) : undefined,
        cambio: ticketData.cambio !== undefined ? formatMoney(ticketData.cambio) : undefined,
        qrCode: ticketData.qrCode,
        logo,
      })
      await printViaBluetooth(bytes)
      toast({ title: '✅ Ticket enviado a la impresora' })
    } catch (err) {
      toast({
        title: 'Error Bluetooth',
        description: err instanceof Error ? err.message : 'No se pudo conectar a la impresora',
        variant: 'destructive',
      })
    } finally {
      setPrinting(false)
    }
  }

  function handlePdfPrint() {
    window.print()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary-700" />
      </div>
    )
  }

  if (!ticketData) {
    return (
      <div className="p-6 text-center space-y-4">
        <p className="text-muted-foreground">No se encontró el ticket</p>
        <Button variant="outline" onClick={() => router.back()}>Volver</Button>
      </div>
    )
  }

  return (
    <>
      {/* Print CSS — hide controls when printing to PDF */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .ticket-preview { border: none !important; }
        }
      `}</style>

      <div className="p-4 space-y-4 max-w-sm mx-auto">
        <div className="flex items-center gap-3 no-print">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-bold">Imprimir ticket</h1>
        </div>

        <TicketPreview data={ticketData} />

        <div className="flex flex-col gap-3 no-print">
          <Button
            className="w-full"
            onClick={handleBluetoothPrint}
            disabled={printing}
          >
            {printing
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <><Bluetooth className="h-4 w-4" /> Imprimir por Bluetooth</>
            }
          </Button>

          <Button variant="outline" className="w-full" onClick={handlePdfPrint}>
            <Download className="h-4 w-4" /> Guardar como PDF
          </Button>

          <Button variant="ghost" className="w-full" onClick={() => router.push('/tickets')}>
            Volver a tickets
          </Button>
        </div>
      </div>
    </>
  )
}
