'use client'

import { Button } from '@/components/ui/button'
import { Printer } from 'lucide-react'

const LOGO_URL = 'https://res.cloudinary.com/djs8dtzrq/image/upload/v1777329446/PHOTO-2026-04-27-16-21-06-removebg-preview_fczmpb.png'

export interface RevisionRow {
  fechaISO: string
  cliente: string
  sucursal: string
  cobrador: string
  tipo: string
  capital: number
  accion: 'MESA_CONTROL_FORWARD' | 'MESA_CONTROL_RETURN'
  mcNombre: string
  observaciones: Array<{ label: string; texto: string }>
}

interface Props {
  weekLabel: string
  scopeLabel: string
  mostrarColumnaRevisor: boolean
  aprobadas: number
  regresadas: number
  total: number
  pct: number
  capitalAprobado: number
  filas: RevisionRow[]
}

function fmt(n: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN', minimumFractionDigits: 0,
  }).format(n)
}

function fmtFechaHora(iso: string) {
  const d = new Date(iso)
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const yy = d.getUTCFullYear()
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const min = String(d.getUTCMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yy} ${hh}:${min}`
}

const STYLE = `
  /* @page a top-level para que TODOS los navegadores fijen la
     orientación default a horizontal (algunos ignoran @page cuando
     está anidado dentro de @media print). */
  @page { size: A4 landscape; margin: 1.2cm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #000; padding: 20px; position: relative; }
  .brand-logo { position: absolute; top: 8px; right: 20px; height: 120px; }
  h2 { font-size: 17px; margin-bottom: 6px; color: #1a3a5c; }
  .meta { display: flex; flex-wrap: wrap; gap: 16px; font-size: 11px; color: #444; margin-bottom: 16px; border-bottom: 1px solid #ccc; padding-bottom: 10px; padding-right: 140px; }
  .meta strong { color: #000; }
  .kpi { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
  .kpi-box { border: 1px solid #c7d8e8; border-radius: 6px; padding: 10px 16px; min-width: 140px; }
  .kpi-box .kpi-label { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 2px; }
  .kpi-box .kpi-val   { font-size: 28px; font-weight: 800; line-height: 1; }
  .kpi-box .kpi-sub   { font-size: 10px; color: #555; margin-top: 4px; }
  .kpi-aprobadas .kpi-val { color: #15803d; }
  .kpi-regresadas .kpi-val { color: #b45309; }
  .kpi-pct .kpi-val { color: #4f46e5; }
  .kpi-total .kpi-val { color: #1a3a5c; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  th { background: #1a3a5c; color: #fff; padding: 7px 8px; text-align: left; font-size: 11px; white-space: nowrap; }
  td { padding: 6px 8px; border-bottom: 1px solid #e0e0e0; vertical-align: top; }
  tr.alt td { background: #f7f7f7; }
  .right { text-align: right; }
  .decision-aprobada { color: #15803d; font-weight: 700; background: #d1fae5; padding: 2px 6px; border-radius: 4px; font-size: 10px; white-space: nowrap; }
  .decision-regresada { color: #b45309; font-weight: 700; background: #fef3c7; padding: 2px 6px; border-radius: 4px; font-size: 10px; white-space: nowrap; }
  .obs { font-size: 10px; color: #444; }
  .obs .obs-label { font-weight: 700; color: #1a3a5c; }
  .obs ul { list-style: none; padding: 0; margin: 0; }
  .obs li { margin-bottom: 3px; }
  .empty { color: #999; font-style: italic; padding: 20px 0; text-align: center; font-size: 12px; }
  .footer { margin-top: 16px; font-size: 10px; color: #888; text-align: right; }
  @media print {
    body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`

export function ImprimirReporteMCButton(props: Props) {
  function handlePrint() {
    const {
      weekLabel, scopeLabel, mostrarColumnaRevisor,
      aprobadas, regresadas, total, pct, capitalAprobado, filas,
    } = props

    const generadoEl = new Date().toLocaleString('es-MX', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

    const kpiHtml = `
      <div class="kpi">
        <div class="kpi-box kpi-total">
          <div class="kpi-label">Total revisadas</div>
          <div class="kpi-val">${total}</div>
        </div>
        <div class="kpi-box kpi-aprobadas">
          <div class="kpi-label">Aprobadas</div>
          <div class="kpi-val">${aprobadas}</div>
          <div class="kpi-sub">${fmt(capitalAprobado)}</div>
        </div>
        <div class="kpi-box kpi-regresadas">
          <div class="kpi-label">Regresadas</div>
          <div class="kpi-val">${regresadas}</div>
        </div>
        <div class="kpi-box kpi-pct">
          <div class="kpi-label">% Aprobación</div>
          <div class="kpi-val">${pct}%</div>
        </div>
      </div>
    `

    const tableHtml = filas.length === 0
      ? `<div class="empty">Sin actividad de revisión en esta semana.</div>`
      : `
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Sucursal</th>
              <th>Coordinador</th>
              <th>Tipo</th>
              <th class="right">Capital</th>
              <th>Decisión</th>
              <th>Observaciones</th>
              ${mostrarColumnaRevisor ? '<th>Revisó</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${filas.map((f, i) => `
              <tr${i % 2 === 1 ? ' class="alt"' : ''}>
                <td>${fmtFechaHora(f.fechaISO)}</td>
                <td><strong>${escape(f.cliente)}</strong></td>
                <td>${escape(f.sucursal)}</td>
                <td>${escape(f.cobrador)}</td>
                <td>${escape(f.tipo)}</td>
                <td class="right">${fmt(f.capital)}</td>
                <td>
                  <span class="${f.accion === 'MESA_CONTROL_FORWARD' ? 'decision-aprobada' : 'decision-regresada'}">
                    ${f.accion === 'MESA_CONTROL_FORWARD' ? 'Aprobada' : 'Regresada'}
                  </span>
                </td>
                <td class="obs">
                  ${f.observaciones.length === 0
                    ? '<span style="color:#999">—</span>'
                    : `<ul>${f.observaciones.map((o) => `<li><span class="obs-label">${escape(o.label)}:</span> ${escape(o.texto)}</li>`).join('')}</ul>`}
                </td>
                ${mostrarColumnaRevisor ? `<td>${escape(f.mcNombre)}</td>` : ''}
              </tr>
            `).join('')}
          </tbody>
        </table>
      `

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Reporte Mesa de Control — ${escape(weekLabel)}</title>
  <style>${STYLE}</style>
</head>
<body>
  <img class="brand-logo" src="${LOGO_URL}" alt="MicroKapital" />
  <h2>MicroKapital Financiera</h2>
  <div class="meta">
    <div><strong>Reporte:</strong> Mesa de Control</div>
    <div><strong>Semana:</strong> ${escape(weekLabel)}</div>
    <div><strong>Alcance:</strong> ${escape(scopeLabel)}</div>
    <div><strong>Generado:</strong> ${generadoEl}</div>
  </div>
  ${kpiHtml}
  ${tableHtml}
  <div class="footer">MicroKapital · Sistema de gestión</div>
  <script>
    window.onload = function () {
      setTimeout(function () { window.print(); }, 300);
    };
  </script>
</body>
</html>`

    const w = window.open('', '_blank')
    if (!w) {
      alert('El navegador bloqueó la ventana emergente. Permite pop-ups para imprimir.')
      return
    }
    w.document.write(html)
    w.document.close()
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handlePrint}>
      <Printer className="h-4 w-4" />
      Imprimir hoja
    </Button>
  )
}

/** Escape HTML para inyectar en el template sin XSS. */
function escape(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
