'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Printer } from 'lucide-react'
import { format } from 'date-fns'

interface Props {
  parcial: {
    id: string
    numeroCorte: number
    totalAEntregar: string
    totalEfectivoCobrado: string
    totalRecibidoDeOtros: string
    fecha: string | Date
  }
  cobradorNombre: string
  sucursalNombre: string
  receptorNombre?: string | null
  // Cobros aplicados en la ventana del parcial (desde el parcial N-1
  // hasta este). Lista detallada que va al ticket como "COBROS DEL DIA".
  pagos?: Array<{
    clienteNombre: string
    monto: number
    metodoPago: string
    numeroPago?: number | null
  }>
}

/**
 * Ticket imprimible del parcial. Se imprime, se firma, y la foto del
 * ticket firmado se sube al entregarlo. Es el único comprobante físico
 * del flujo coord → concentradora.
 */
export function ParcialPrintButton({ parcial, cobradorNombre, sucursalNombre, receptorNombre, pagos }: Props) {
  const [printing, setPrinting] = useState(false)

  function imprimir() {
    setPrinting(true)
    const w = window.open('', '_blank', 'width=380,height=600')
    if (!w) {
      setPrinting(false)
      alert('Permite popups para imprimir el ticket')
      return
    }
    const fechaDate = typeof parcial.fecha === 'string' ? new Date(parcial.fecha) : parcial.fecha
    const fechaLabel = format(fechaDate, 'dd/MM/yyyy')
    const horaLabel = format(new Date(), 'HH:mm')
    const total = Number(parcial.totalAEntregar)
    const efectivo = Number(parcial.totalEfectivoCobrado)
    const recibido = Number(parcial.totalRecibidoDeOtros)

    function escHtml(s: string) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }
    function metodoMark(m: string) {
      return m === 'CASH' ? '$' : m === 'CARD' ? 'T' : m === 'TRANSFER' ? 'B' : ' '
    }
    function money(n: number) {
      return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
    const detalleHtml = pagos && pagos.length > 0
      ? `
  <div class="line"></div>
  <div class="section">COBROS DEL DIA (${pagos.length})</div>
  ${pagos.map((p, i) => {
    const nombre = escHtml(p.clienteNombre)
    const numPagoTag = p.numeroPago != null ? ` #${p.numeroPago}` : ''
    return `<div class="row cobro"><span>${i + 1}. ${metodoMark(p.metodoPago)} ${nombre}${numPagoTag}</span><span class="val">${money(p.monto)}</span></div>`
  }).join('')}
  <div class="line"></div>`
      : ''

    const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Parcial #${parcial.numeroCorte}</title>
<style>
  @page { size: 72mm auto; margin: 0; }
  @media print { body { margin: 0 } }
  body { font-family: 'Courier New', monospace; font-size: 11px; width: 72mm; padding: 6mm 4mm; color: #000; margin: 0 auto; }
  h1 { font-size: 13px; text-align: center; margin: 0 0 2mm; letter-spacing: 2px }
  .sub { text-align: center; font-size: 10px; margin: 0 0 4mm }
  .line { border-top: 1px dashed #000; margin: 2mm 0 }
  .row { display: flex; justify-content: space-between; align-items: baseline; margin: 1px 0 }
  .val { font-weight: bold; font-variant-numeric: tabular-nums }
  .total { font-size: 14px; font-weight: bold; margin: 3mm 0 2mm; text-align: center; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 2mm 0 }
  .section { font-weight: bold; text-align: left; margin: 2mm 0 1mm; font-size: 11px }
  .cobro { font-size: 10px; line-height: 1.35; gap: 4px }
  .cobro span:first-child { word-break: break-word }
  .firma { margin-top: 10mm; text-align: center }
  .firma .linea { border-top: 1px solid #000; margin: 10mm 4mm 1mm }
  .firma .quien { font-size: 10px }
  .meta { font-size: 9px; opacity: .7; text-align: center; margin-top: 4mm }
</style>
</head>
<body>
  <h1>MICROKAPITAL</h1>
  <div class="sub">CORTE PARCIAL #${parcial.numeroCorte}</div>
  <div class="line"></div>
  <div class="row"><span>Sucursal:</span><span class="val">${sucursalNombre.toUpperCase()}</span></div>
  <div class="row"><span>Cobradora:</span><span class="val">${cobradorNombre.toUpperCase()}</span></div>
  ${receptorNombre ? `<div class="row"><span>Entrega a:</span><span class="val">${receptorNombre.toUpperCase()}</span></div>` : ''}
  <div class="row"><span>Fecha:</span><span class="val">${fechaLabel}</span></div>
  <div class="row"><span>Impreso:</span><span class="val">${horaLabel}</span></div>
  <div class="line"></div>
  <div class="row"><span>Efectivo cobrado:</span><span class="val">$${efectivo.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span></div>
  ${recibido > 0 ? `<div class="row"><span>Recibido de otros:</span><span class="val">$${recibido.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span></div>` : ''}
  <div class="total">A ENTREGAR $${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
  ${detalleHtml}
  <div class="firma">
    <div class="linea"></div>
    <div class="quien">Firma recibí (${receptorNombre ? receptorNombre.toUpperCase() : 'CONCENTRADORA'})</div>
  </div>
  <div class="firma">
    <div class="linea"></div>
    <div class="quien">Firma entregué (${cobradorNombre.toUpperCase()})</div>
  </div>
  <div class="meta">microkapital.com · Parcial ID ${parcial.id.slice(0, 8)}</div>
  <script>
    window.onload = function() { window.print(); setTimeout(function(){ window.close() }, 500); };
  </script>
</body>
</html>`

    w.document.write(html)
    w.document.close()
    setTimeout(() => setPrinting(false), 1000)
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={imprimir} disabled={printing}>
      <Printer className="h-3.5 w-3.5" /> Imprimir
    </Button>
  )
}
