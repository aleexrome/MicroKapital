'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

const LOGO_URL = 'https://res.cloudinary.com/djs8dtzrq/image/upload/v1777329446/PHOTO-2026-04-27-16-21-06-removebg-preview_fczmpb.png'

export interface SeccionTabla {
  tipo: 'tabla'
  titulo: string
  headers: string[]                          // primera fila de encabezados
  rows: Array<Array<string | number>>
  /** Indices de columnas que deben alinearse a la derecha (números/montos) */
  rightAlign?: number[]
  /** Fila de totales opcional (mismo número de cells que headers) */
  footer?: Array<string | number>
}

export interface SeccionMetricas {
  tipo: 'metricas'
  titulo: string
  items: Array<{ label: string; valor: string; sub?: string }>
}

export type SeccionReporte = SeccionTabla | SeccionMetricas

export interface ImprimirReporteData {
  titulo: string
  empresa: string
  subtitulo?: string
  filtros: Array<{ label: string; valor: string }>
  secciones: SeccionReporte[]
}

interface Props {
  data: ImprimirReporteData
  /** Tamaño de página: portrait por default. */
  landscape?: boolean
}

export function ImprimirReporteButton({ data, landscape = false }: Props) {
  function handlePrint() {
    const generadoEl = new Date().toLocaleString('es-MX', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

    const filtrosHtml = data.filtros.length === 0
      ? ''
      : `<div class="filtros">
          ${data.filtros.map((f) => `<span><strong>${escapeHtml(f.label)}:</strong> ${escapeHtml(f.valor)}</span>`).join('')}
        </div>`

    const seccionesHtml = data.secciones.map((s) => {
      if (s.tipo === 'metricas') {
        return `
          <section>
            <h3>${escapeHtml(s.titulo)}</h3>
            <div class="metricas">
              ${s.items.map((i) => `
                <div class="metrica">
                  <span class="metrica-label">${escapeHtml(i.label)}</span>
                  <span class="metrica-valor">${escapeHtml(i.valor)}</span>
                  ${i.sub ? `<span class="metrica-sub">${escapeHtml(i.sub)}</span>` : ''}
                </div>
              `).join('')}
            </div>
          </section>`
      }

      const headerHtml = s.headers.map((h, i) =>
        `<th${(s.rightAlign ?? []).includes(i) ? ' class="right"' : ''}>${escapeHtml(h)}</th>`
      ).join('')
      const bodyHtml = s.rows.map((row, ri) => `
        <tr class="${ri % 2 === 1 ? 'alt' : ''}">
          ${row.map((cell, ci) =>
            `<td${(s.rightAlign ?? []).includes(ci) ? ' class="right"' : ''}>${escapeHtml(String(cell))}</td>`
          ).join('')}
        </tr>`).join('')
      const footerHtml = s.footer
        ? `<tfoot><tr>${s.footer.map((cell, ci) =>
            `<td${(s.rightAlign ?? []).includes(ci) ? ' class="right"' : ''}>${escapeHtml(String(cell))}</td>`
          ).join('')}</tr></tfoot>`
        : ''
      return `
        <section>
          <h3>${escapeHtml(s.titulo)}</h3>
          <table>
            <thead><tr>${headerHtml}</tr></thead>
            <tbody>${bodyHtml}</tbody>
            ${footerHtml}
          </table>
        </section>`
    }).join('')

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(data.titulo)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, sans-serif; font-size: 12px; color: #000;
      padding: 20px; position: relative;
    }
    img.logo {
      position: absolute; top: 8px; right: 20px; height: 110px; z-index: 10;
    }
    h1 { font-size: 20px; margin-bottom: 4px; color: #1a3a5c; }
    h3 { font-size: 14px; margin: 18px 0 8px; color: #1a3a5c; border-bottom: 2px solid #e0e0e0; padding-bottom: 4px; }
    .empresa { font-size: 13px; color: #444; margin-bottom: 2px; font-weight: 600; }
    .subtitulo { font-size: 11px; color: #666; margin-bottom: 10px; }
    .filtros {
      display: flex; flex-wrap: wrap; gap: 12px;
      font-size: 11px; color: #444;
      margin-bottom: 14px; padding: 8px 0;
      border-top: 1px solid #ccc; border-bottom: 1px solid #ccc;
    }
    .filtros strong { color: #000; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #1a3a5c; color: #fff; padding: 6px 8px; text-align: left; font-size: 11px; }
    td { padding: 5px 8px; border-bottom: 1px solid #e0e0e0; }
    tr.alt td { background: #f7f7f7; }
    .right { text-align: right; }
    tfoot td { border-top: 2px solid #1a3a5c; font-weight: bold; background: #f0f4f8; }
    .metricas {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 10px;
    }
    .metrica {
      display: flex; flex-direction: column;
      padding: 10px; background: #f7f7f7; border-radius: 6px;
      border: 1px solid #e0e0e0;
    }
    .metrica-label { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 0.04em; }
    .metrica-valor { font-size: 18px; font-weight: bold; color: #1a3a5c; margin: 2px 0; }
    .metrica-sub { font-size: 10px; color: #888; }
    .footer { margin-top: 20px; font-size: 10px; color: #888; text-align: right; }
    @media print {
      @page { margin: 1.5cm; size: ${landscape ? 'landscape' : 'portrait'}; }
      img.logo { position: fixed; top: 0; right: 0.5cm; height: 110px; }
    }
  </style>
</head>
<body>
  <img class="logo" src="${LOGO_URL}" alt="MicroKapital" />
  <h1>${escapeHtml(data.titulo)}</h1>
  <p class="empresa">${escapeHtml(data.empresa)}</p>
  ${data.subtitulo ? `<p class="subtitulo">${escapeHtml(data.subtitulo)}</p>` : ''}
  ${filtrosHtml}
  ${seccionesHtml}
  <div class="footer">Generado el ${generadoEl}</div>
</body>
</html>`

    const win = window.open('', '_blank', 'width=1024,height=768')
    if (!win) {
      alert('El navegador bloqueó la ventana emergente. Permite ventanas emergentes para esta página.')
      return
    }
    win.document.write(html)
    win.document.close()
    win.onload = () => {
      // Pequeño delay para que la imagen del logo cargue antes de imprimir
      setTimeout(() => win.print(), 600)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handlePrint} className="flex items-center gap-1.5">
      <Printer className="h-4 w-4" />
      Imprimir reporte
    </Button>
  )
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
