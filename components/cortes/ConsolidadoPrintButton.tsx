'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Printer } from 'lucide-react'
import { format } from 'date-fns'

interface Props {
  consolidado: {
    id: string
    numeroCorte: number
    totalAEntregar: string
    fecha: string | Date
    consolidadoHijos?: Array<{
      id: string
      numeroCorte: number
      totalAEntregar: string
      user: { nombre: string }
    }>
  }
  concentradoraNombre: string
  sucursalNombre: string
}

/**
 * Botón que abre una ventana nueva con el ticket consolidado listo
 * para imprimir. Simple HTML (no ESC/POS) — se imprime desde el
 * navegador en la impresora térmica que el usuario tenga configurada.
 */
export function ConsolidadoPrintButton({ consolidado, concentradoraNombre, sucursalNombre }: Props) {
  const [printing, setPrinting] = useState(false)

  function imprimir() {
    setPrinting(true)
    const w = window.open('', '_blank', 'width=380,height=600')
    if (!w) {
      setPrinting(false)
      alert('Permite popups para imprimir el ticket')
      return
    }

    const fechaDate = typeof consolidado.fecha === 'string' ? new Date(consolidado.fecha) : consolidado.fecha
    const fechaLabel = format(fechaDate, 'dd/MM/yyyy')
    const horaLabel = format(new Date(), 'HH:mm')
    const total = Number(consolidado.totalAEntregar)
    const hijos = consolidado.consolidadoHijos ?? []

    const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Consolidado #${consolidado.numeroCorte}</title>
<style>
  @page { size: 72mm auto; margin: 0; }
  @media print { body { margin: 0 } }
  body { font-family: 'Courier New', monospace; font-size: 11px; width: 72mm; padding: 6mm 4mm; color: #000; margin: 0 auto; }
  h1 { font-size: 13px; text-align: center; margin: 0 0 2mm; letter-spacing: 2px }
  .sub { text-align: center; font-size: 10px; margin: 0 0 4mm }
  .line { border-top: 1px dashed #000; margin: 2mm 0 }
  .row { display: flex; justify-content: space-between; align-items: baseline; margin: 1px 0 }
  .label { opacity: .8 }
  .val { font-weight: bold; font-variant-numeric: tabular-nums }
  table { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 2mm }
  th, td { padding: 2px 0; text-align: left; vertical-align: top }
  th { border-bottom: 1px solid #000 }
  td.r, th.r { text-align: right; font-variant-numeric: tabular-nums }
  .total { font-size: 14px; font-weight: bold; margin: 3mm 0 2mm; text-align: center; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 2mm 0 }
  .firma { margin-top: 10mm; text-align: center }
  .firma .linea { border-top: 1px solid #000; margin: 10mm 4mm 1mm }
  .firma .quien { font-size: 10px }
  .meta { font-size: 9px; opacity: .7; text-align: center; margin-top: 4mm }
</style>
</head>
<body>
  <h1>MICROKAPITAL</h1>
  <div class="sub">CONSOLIDADO DE CORTE #${consolidado.numeroCorte}</div>
  <div class="line"></div>
  <div class="row"><span class="label">Sucursal:</span><span class="val">${sucursalNombre.toUpperCase()}</span></div>
  <div class="row"><span class="label">Concentradora:</span><span class="val">${concentradoraNombre.toUpperCase()}</span></div>
  <div class="row"><span class="label">Fecha:</span><span class="val">${fechaLabel}</span></div>
  <div class="row"><span class="label">Impreso:</span><span class="val">${horaLabel}</span></div>
  <div class="line"></div>
  <div style="font-size:10px;margin:2mm 0 1mm;font-weight:bold">PARCIALES INCLUIDOS (${hijos.length})</div>
  <table>
    <thead>
      <tr><th>Cobradora</th><th class="r">Monto</th></tr>
    </thead>
    <tbody>
      ${hijos.map(h => `
        <tr>
          <td>${h.user.nombre.toUpperCase()} <span style="opacity:.6">#${h.numeroCorte}</span></td>
          <td class="r">$${Number(h.totalAEntregar).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  <div class="total">TOTAL $${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
  <div class="firma">
    <div class="linea"></div>
    <div class="quien">Firma recibí (DG / DC)</div>
  </div>
  <div class="firma">
    <div class="linea"></div>
    <div class="quien">Firma entregué (${concentradoraNombre.toUpperCase()})</div>
  </div>
  <div class="meta">microkapital.com · Consolidado ID ${consolidado.id.slice(0, 8)}</div>
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
      <Printer className="h-3.5 w-3.5" /> Imprimir ticket
    </Button>
  )
}
