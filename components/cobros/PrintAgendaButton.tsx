'use client'

import { Button } from '@/components/ui/button'
import { Printer } from 'lucide-react'

export interface SchedulePrintItem {
  cliente: string
  numeroPago: number
  totalPagos: number
  montoEsperado: number
  fechaVencimiento: string
  tipoPrestamo: string
  estado: string
  cobrador?: string
}

interface PrintAgendaButtonProps {
  items: SchedulePrintItem[]
  fecha: string
  empresa: string
  sucursal?: string
  totalEsperado: number
  showCobrador?: boolean
}

export function PrintAgendaButton({
  items,
  fecha,
  empresa,
  sucursal,
  totalEsperado,
  showCobrador = false,
}: PrintAgendaButtonProps) {
  function formatMoney(amount: number) {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 2,
    }).format(amount)
  }

  function handlePrint() {
    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) return

    const cobradorCol = showCobrador ? '<th>Cobrador</th>' : ''
    const cobradorColspan = showCobrador ? 4 : 3

    const rows = items
      .map((item) => {
        const isVencido = item.estado === 'OVERDUE'
        const rowStyle = isVencido ? 'background:#fff5f5;' : ''
        const estadoBadge = isVencido
          ? '<span style="background:#fee2e2;color:#b91c1c;padding:1px 6px;border-radius:9999px;font-size:10px;font-weight:600;">Vencido</span>'
          : ''
        return `
          <tr style="${rowStyle}">
            <td>${item.cliente} ${estadoBadge}</td>
            ${showCobrador ? `<td>${item.cobrador ?? '-'}</td>` : ''}
            <td style="text-align:center">${item.numeroPago} / ${item.totalPagos}</td>
            <td style="text-align:right;font-weight:600">${formatMoney(item.montoEsperado)}</td>
            <td>${item.fechaVencimiento}</td>
            <td>${item.tipoPrestamo}</td>
          </tr>`
      })
      .join('')

    const generadoEn = new Date().toLocaleString('es-MX', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Pactados del día – ${fecha}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 12px; padding: 24px; color: #111; }
    .header { margin-bottom: 16px; }
    .header h1 { font-size: 20px; font-weight: 700; color: #1e3a8a; }
    .header p { font-size: 12px; color: #555; margin-top: 3px; }
    .summary { display: flex; gap: 16px; margin-bottom: 16px; }
    .summary-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 8px 14px; }
    .summary-box .label { font-size: 10px; color: #3b82f6; font-weight: 600; text-transform: uppercase; }
    .summary-box .value { font-size: 16px; font-weight: 700; color: #1d4ed8; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; }
    thead th {
      background: #1e3a8a;
      color: white;
      padding: 9px 10px;
      text-align: left;
      font-size: 11px;
      font-weight: 600;
    }
    tbody td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; font-size: 11px; vertical-align: middle; }
    tbody tr:nth-child(even) td { background: #f9fafb; }
    tfoot td {
      padding: 8px 10px;
      font-weight: 700;
      font-size: 12px;
      background: #f1f5f9;
      border-top: 2px solid #1e3a8a;
    }
    .footer { margin-top: 14px; font-size: 10px; color: #9ca3af; text-align: right; }
    @media print {
      body { padding: 10px; }
      @page { margin: 1cm; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Pactados del día</h1>
    <p>${empresa}${sucursal ? ` · ${sucursal}` : ''} · ${fecha}</p>
  </div>

  <div class="summary">
    <div class="summary-box">
      <div class="label">Total por cobrar</div>
      <div class="value">${formatMoney(totalEsperado)}</div>
    </div>
    <div class="summary-box">
      <div class="label">Clientes</div>
      <div class="value">${items.length}</div>
    </div>
    <div class="summary-box">
      <div class="label">Vencidos</div>
      <div class="value" style="color:#dc2626">${items.filter((i) => i.estado === 'OVERDUE').length}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Cliente</th>
        ${cobradorCol}
        <th style="text-align:center">No. Pago</th>
        <th style="text-align:right">Monto Pactado</th>
        <th>Fecha de Pago</th>
        <th>Tipo</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="${cobradorColspan}">Total</td>
        <td style="text-align:right">${formatMoney(totalEsperado)}</td>
        <td colspan="2"></td>
      </tr>
    </tfoot>
  </table>

  <p class="footer">Generado el ${generadoEn}</p>

  <script>
    window.onload = function () { window.print(); }
  </script>
</body>
</html>`

    printWindow.document.write(html)
    printWindow.document.close()
  }

  return (
    <div className="flex justify-center pt-4 pb-2">
      <Button onClick={handlePrint} className="gap-2 px-6">
        <Printer className="h-4 w-4" />
        Imprimir pactados del día
      </Button>
    </div>
  )
}
