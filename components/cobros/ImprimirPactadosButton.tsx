'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Logo de la empresa (PNG transparente, "MicroKapital_Logo" en
// Cloudinary). Cloudinary resuelve a la última versión sin v<id>.
const LOGO_URL = 'https://res.cloudinary.com/djs8dtzrq/image/upload/MicroKapital_Logo.png'

export interface PactadosPrintRow {
  clientNombre: string
  numeroPago: number
  totalPagos: number
  montoEsperado: number
  diaPago: string | null
  tipo: string
  cobradorNombre: string
  branchNombre: string
  cobrado: boolean
  montoCobrado: number | null
}

interface Props {
  rows: PactadosPrintRow[]
  fechaLabel: string
  branchNombre: string      // "Todas" o nombre de sucursal filtrada
  cobradorNombre: string    // nombre del usuario o "Todos"
}

const TIPO_HORARIO: Record<string, string> = {
  SOLIDARIO:  'Semanal',
  INDIVIDUAL: 'Semanal',
  AGIL:       'Diario hábil',
  FIDUCIARIO: 'Quincenal',
}

function fmt(n: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN', minimumFractionDigits: 0,
  }).format(n)
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

export function ImprimirPactadosButton({ rows, fechaLabel, branchNombre, cobradorNombre }: Props) {
  function handlePrint() {
    const generadoEl = new Date().toLocaleString('es-MX', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

    const multiSucursal  = new Set(rows.map((r) => r.branchNombre)).size > 1
    const multiCobrador  = new Set(rows.map((r) => r.cobradorNombre)).size > 1

    const headerExtra = [
      multiSucursal ? '<th>Sucursal</th>'  : '',
      multiCobrador ? '<th>Cobrador</th>'  : '',
    ].join('')

    const cobradosTotal  = rows.filter((r) => r.cobrado).length
    const pendienteTotal = rows.filter((r) => !r.cobrado).length
    const montoPactado   = rows.reduce((s, r) => s + r.montoEsperado, 0)
    const montoCobrado   = rows.filter((r) => r.cobrado).reduce((s, r) => s + (r.montoCobrado ?? r.montoEsperado), 0)

    const bodyRows = rows.map((r, i) => {
      const estadoCell = r.cobrado
        ? '<td class="center cobrado">✓ Cobrado</td>'
        : '<td class="center pendiente">⏳ Pendiente</td>'
      const extra = [
        multiSucursal ? `<td>${r.branchNombre}</td>` : '',
        multiCobrador ? `<td>${r.cobradorNombre}</td>` : '',
      ].join('')
      return `
        <tr class="${i % 2 === 1 ? 'alt' : ''}${r.cobrado ? ' fila-cobrada' : ''}">
          <td>${r.clientNombre}</td>
          <td class="center">${r.numeroPago} / ${r.totalPagos}</td>
          <td class="right">${fmt(r.montoEsperado)}</td>
          <td class="center">${r.diaPago ? cap(r.diaPago) : '—'}</td>
          <td class="center">${TIPO_HORARIO[r.tipo] ?? r.tipo}</td>
          ${estadoCell}
          ${extra}
        </tr>`
    }).join('')

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Pactados del día — ${fechaLabel}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #000; padding: 20px; position: relative; }
    /* Logo absoluto, no consume espacio en el flujo. Solo página 1. */
    .brand-logo { position: absolute; top: 8px; right: 20px; height: 140px; }
    h2 { font-size: 17px; margin-bottom: 6px; }
    .meta { display: flex; flex-wrap: wrap; gap: 16px; font-size: 11px; color: #444; margin-bottom: 16px; border-bottom: 1px solid #ccc; padding-bottom: 10px; }
    .meta strong { color: #000; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #1a3a5c; color: #fff; padding: 7px 8px; text-align: left; font-size: 11px; white-space: nowrap; }
    td { padding: 5px 8px; border-bottom: 1px solid #e0e0e0; vertical-align: middle; }
    tr.alt td { background: #f7f7f7; }
    tr.fila-cobrada td { opacity: 0.65; }
    .center { text-align: center; }
    .right  { text-align: right; }
    .cobrado   { color: #15803d; font-weight: 600; }
    .pendiente { color: #b45309; font-weight: 600; }
    tfoot td { border-top: 2px solid #1a3a5c; font-weight: bold; background: #f0f4f8; padding: 6px 8px; }
    .footer { margin-top: 14px; font-size: 10px; color: #888; text-align: right; }
    @media print { @page { margin: 1.5cm; size: landscape; } }
  </style>
</head>
<body>
  <img class="brand-logo" src="${LOGO_URL}" alt="Logo" />
  <h2>Pactados del día</h2>
  <div class="meta">
    <span><strong>Fecha:</strong> ${fechaLabel}</span>
    <span><strong>Sucursal:</strong> ${branchNombre}</span>
    <span><strong>Cobrador:</strong> ${cobradorNombre}</span>
    <span><strong>Pactados:</strong> ${rows.length}</span>
    <span style="color:#15803d"><strong>Cobrados:</strong> ${cobradosTotal} · ${fmt(montoCobrado)}</span>
    ${pendienteTotal > 0 ? `<span style="color:#b45309"><strong>Pendientes:</strong> ${pendienteTotal}</span>` : ''}
  </div>
  <table>
    <thead>
      <tr>
        <th>Cliente</th>
        <th class="center">Pago #</th>
        <th class="right">Monto pactado</th>
        <th class="center">Día de cobro</th>
        <th class="center">Frecuencia</th>
        <th class="center">Estado</th>
        ${headerExtra}
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
    <tfoot>
      <tr>
        <td colspan="2">Total</td>
        <td class="right">${fmt(montoPactado)}</td>
        <td colspan="3">${cobradosTotal} cobrados · ${pendienteTotal} pendientes</td>
        ${multiSucursal ? '<td></td>' : ''}
        ${multiCobrador ? '<td></td>' : ''}
      </tr>
    </tfoot>
  </table>
  <div class="footer">Generado el ${generadoEl}</div>
</body>
</html>`

    const win = window.open('', '_blank', 'width=960,height=700')
    if (!win) {
      alert('El navegador bloqueó la ventana emergente. Permite ventanas emergentes para esta página.')
      return
    }
    win.document.write(html)
    win.document.close()
    win.onload = () => win.print()
  }

  if (rows.length === 0) return null

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handlePrint}
      className="flex items-center gap-1.5"
    >
      <Printer className="h-4 w-4" />
      Imprimir lista
    </Button>
  )
}
