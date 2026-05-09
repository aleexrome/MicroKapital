'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Logo de la empresa (PNG transparente, subido a Cloudinary como
// "MicroKapital_Logo"). Cloudinary resuelve a la versión más reciente
// sin necesidad de hardcodear `v<timestamp>`.
const LOGO_URL = 'https://res.cloudinary.com/djs8dtzrq/image/upload/v1777329446/PHOTO-2026-04-27-16-21-06-removebg-preview_fczmpb.png'

export interface RutaCobroRow {
  clientNombre: string
  tipo: string
  numeroPago: number
  // ISO date string para que el componente formatee fecha + día en
  // español sin depender de la zona horaria del navegador.
  fechaVencimiento: string
  montoEsperado: number
  montoCobrado: number   // 0 si no cobrado
  estado: string
  // true si el schedule ya está PAID/ADVANCE pero el Payment se hizo en
  // una semana anterior (cobro anticipado o renovación absorbida). Se
  // muestra como "Pre-pagado" para que la cobradora sepa que NO debe
  // visitar al cliente esta semana, y no se cuenta en cobranza efectiva.
  prePagado?: boolean
}

export interface RutaColocacionRow {
  clientNombre: string
  tipo: string
  esRenovacion: boolean
  capital: number
}

export interface RutaCobradorRow {
  nombre: string
  rolLabel: string
  branchNombre?: string
  scheduleCount: number
  cobradosCount: number
  totalAPagar: number
  totalCobrado: number
  cobranzaPct: number
  colocacion: number
  metaTarget: number
  metaPct: number
}

interface Props {
  weekLabel: string
  scopeLabel: string
  // Vista coordinador
  cobros?: RutaCobroRow[]
  colocaciones?: RutaColocacionRow[]
  totalAPagar?: number
  totalCobrado?: number
  colocacionTotal?: number
  metaTarget?: number
  cobranzaPct?: number
  metaPct?: number
  // Vista gerente / DG
  cobradores?: RutaCobradorRow[]
  showBranch?: boolean
}

function fmt(n: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN', minimumFractionDigits: 0,
  }).format(n)
}

function fmtFecha(iso: string) {
  // Formato 25/04/2026 — preserva la fecha calendario sin zona horaria
  const d = new Date(iso)
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const yy = d.getUTCFullYear()
  return `${dd}/${mm}/${yy}`
}

const DIAS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
function diaSemana(iso: string) {
  return DIAS_ES[new Date(iso).getUTCDay()]
}

const TIPO_LABEL: Record<string, string> = {
  SOLIDARIO: 'Solidario', INDIVIDUAL: 'Individual', AGIL: 'Ágil', FIDUCIARIO: 'Fiduciario',
}

const ESTADO_LABEL: Record<string, string> = {
  PAID: 'Cobrado', ADVANCE: 'Cobrado', PARTIAL: 'Parcial',
  PENDING: 'Pendiente', OVERDUE: 'Vencido',
}

const PRE_PAGADO_LABEL = 'Pre-pagado'

const BASE_STYLE = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #000; padding: 20px; position: relative; }
  /* Logo posicionado absolutamente para no consumir espacio en el
     flujo del documento — el contenido arranca pegado arriba sin
     margen extra. Sólo aparece en la primera página porque está
     anclado al body. PNG transparente, se muestra tal cual. */
  .brand-logo { position: absolute; top: 8px; right: 20px; height: 140px; }
  h2  { font-size: 17px; margin-bottom: 6px; }
  h3  { font-size: 13px; margin: 20px 0 8px; color: #1a3a5c; border-bottom: 1px solid #c7d8e8; padding-bottom: 4px; }
  .meta { display: flex; flex-wrap: wrap; gap: 16px; font-size: 11px; color: #444; margin-bottom: 16px; border-bottom: 1px solid #ccc; padding-bottom: 10px; }
  .meta strong { color: #000; }
  .kpi { display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 20px; }
  .kpi-box { border: 1px solid #c7d8e8; border-radius: 6px; padding: 10px 16px; min-width: 140px; }
  .kpi-box .kpi-label { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 2px; }
  .kpi-box .kpi-val   { font-size: 28px; font-weight: 800; color: #1a3a5c; line-height: 1; }
  .kpi-box .kpi-sub   { font-size: 10px; color: #555; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  th { background: #1a3a5c; color: #fff; padding: 7px 8px; text-align: left; font-size: 11px; white-space: nowrap; }
  td { padding: 5px 8px; border-bottom: 1px solid #e0e0e0; vertical-align: middle; }
  tr.alt td { background: #f7f7f7; }
  .center { text-align: center; }
  .right  { text-align: right; }
  .cobrado    { color: #15803d; font-weight: 600; }
  .parcial    { color: #92400e; font-weight: 600; }
  .vencido    { color: #b91c1c; font-weight: 600; }
  .pendiente  { color: #6b7280; }
  .prepagado  { color: #6b7280; font-style: italic; }
  .nuevo      { color: #1d4ed8; }
  .renovacion { color: #7c3aed; }
  tfoot td { border-top: 2px solid #1a3a5c; font-weight: bold; background: #f0f4f8; padding: 6px 8px; }
  .empty { color: #999; font-style: italic; padding: 8px 0; font-size: 11px; }
  .footer { margin-top: 16px; font-size: 10px; color: #888; text-align: right; }
  @media print { @page { margin: 1.5cm; size: landscape; } }
`

export function ImprimirRutaButton({
  weekLabel, scopeLabel,
  cobros, colocaciones, totalAPagar = 0, totalCobrado = 0,
  colocacionTotal = 0, metaTarget = 0, cobranzaPct = 0, metaPct = 0,
  cobradores, showBranch = false,
}: Props) {
  function handlePrint() {
    const generadoEl = new Date().toLocaleString('es-MX', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

    let body = ''

    // ── COORDINADOR view ─────────────────────────────────────────────────
    if (cobros !== undefined) {
      // Los pre-pagados (schedule PAID/ADVANCE pero Payment de semana
      // anterior — típico de renovaciones que absorben pagos del crédito
      // viejo) no cuentan en cobrados/pendientes de esta semana.
      const cobradosCount  = cobros.filter((r) => !r.prePagado && (r.estado === 'PAID' || r.estado === 'ADVANCE')).length
      const parcialesCount = cobros.filter((r) => !r.prePagado && r.estado === 'PARTIAL').length
      const pendientesCount = cobros.filter((r) => r.estado === 'PENDING' || r.estado === 'OVERDUE').length
      const prePagadosCount = cobros.filter((r) => r.prePagado).length

      const cobroRows = cobros.map((r, i) => {
        const isPrePagado = r.prePagado === true
        const isCobrado = !isPrePagado && (r.estado === 'PAID' || r.estado === 'ADVANCE')
        const isPartial = !isPrePagado && r.estado === 'PARTIAL'
        const isVencido = r.estado === 'OVERDUE'
        const cls = isPrePagado ? 'prepagado' : isCobrado ? 'cobrado' : isPartial ? 'parcial' : isVencido ? 'vencido' : 'pendiente'
        const estadoLabel = isPrePagado ? PRE_PAGADO_LABEL : (ESTADO_LABEL[r.estado] ?? r.estado)
        return `
          <tr class="${i % 2 === 1 ? 'alt' : ''}">
            <td>${r.clientNombre}</td>
            <td class="center">${TIPO_LABEL[r.tipo] ?? r.tipo}</td>
            <td class="center">Pago ${r.numeroPago}</td>
            <td class="center">${fmtFecha(r.fechaVencimiento)}</td>
            <td class="center">${diaSemana(r.fechaVencimiento)}</td>
            <td class="right">${fmt(r.montoEsperado)}</td>
            <td class="right ${cls}">${r.montoCobrado > 0 ? fmt(r.montoCobrado) : '—'}</td>
            <td class="center ${cls}">${estadoLabel}</td>
          </tr>`
      }).join('')

      const colocRows = (colocaciones ?? []).map((r, i) => `
        <tr class="${i % 2 === 1 ? 'alt' : ''}">
          <td>${r.clientNombre}</td>
          <td class="center">${TIPO_LABEL[r.tipo] ?? r.tipo}</td>
          <td class="center ${r.esRenovacion ? 'renovacion' : 'nuevo'}">${r.esRenovacion ? 'Renovación' : 'Nuevo'}</td>
          <td class="right">${fmt(r.capital)}</td>
        </tr>`
      ).join('')

      body = `
        <img class="brand-logo" src="${LOGO_URL}" alt="Logo" />
        <h2>Ruta Semanal</h2>
        <div class="meta">
          <span><strong>Semana:</strong> ${weekLabel}</span>
          <span><strong>Ruta:</strong> ${scopeLabel}</span>
          <span><strong>Pactados:</strong> ${cobros.length}</span>
          <span class="cobrado"><strong>Cobrados:</strong> ${cobradosCount}</span>
          ${parcialesCount > 0 ? `<span class="parcial"><strong>Parciales:</strong> ${parcialesCount}</span>` : ''}
          ${prePagadosCount > 0 ? `<span class="prepagado"><strong>Pre-pagados:</strong> ${prePagadosCount}</span>` : ''}
          ${pendientesCount > 0 ? `<span class="pendiente"><strong>Pendientes/Vencidos:</strong> ${pendientesCount}</span>` : ''}
        </div>

        <div class="kpi">
          <div class="kpi-box">
            <div class="kpi-label">Cobranza Efectiva</div>
            <div class="kpi-val">${cobranzaPct}%</div>
            <div class="kpi-sub">${fmt(totalCobrado)} de ${fmt(totalAPagar)}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">Meta de Colocación</div>
            <div class="kpi-val">${metaPct}%</div>
            <div class="kpi-sub">${fmt(colocacionTotal)} de ${fmt(metaTarget)} meta</div>
          </div>
        </div>

        <h3>Cobros de la semana (${cobros.length})</h3>
        ${cobros.length === 0
          ? '<p class="empty">Sin cobros pactados esta semana</p>'
          : `<table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th class="center">Tipo</th>
                  <th class="center">Pago</th>
                  <th class="center">Fecha</th>
                  <th class="center">Día</th>
                  <th class="right">Monto pactado</th>
                  <th class="right">Monto cobrado</th>
                  <th class="center">Estado</th>
                </tr>
              </thead>
              <tbody>${cobroRows}</tbody>
              <tfoot>
                <tr>
                  <td colspan="5">Total</td>
                  <td class="right">${fmt(totalAPagar)}</td>
                  <td class="right cobrado">${fmt(totalCobrado)}</td>
                  <td class="center">${cobradosCount} cobrados · ${pendientesCount} pendientes</td>
                </tr>
              </tfoot>
            </table>`
        }

        <h3>Colocación de la semana (${(colocaciones ?? []).length})</h3>
        ${(colocaciones ?? []).length === 0
          ? '<p class="empty">Sin créditos colocados esta semana</p>'
          : `<table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th class="center">Tipo</th>
                  <th class="center">Modalidad</th>
                  <th class="right">Capital</th>
                </tr>
              </thead>
              <tbody>${colocRows}</tbody>
              <tfoot>
                <tr>
                  <td colspan="3">Total colocado</td>
                  <td class="right">${fmt(colocacionTotal)}</td>
                </tr>
              </tfoot>
            </table>`
        }
      `
    }

    // ── GERENTE / DG view ────────────────────────────────────────────────
    if (cobradores !== undefined) {
      const thBranch = showBranch ? '<th>Sucursal</th>' : ''
      const totPactado  = cobradores.reduce((s, x) => s + x.totalAPagar, 0)
      const totCobrado  = cobradores.reduce((s, x) => s + x.totalCobrado, 0)
      const totColoc    = cobradores.reduce((s, x) => s + x.colocacion, 0)
      const totMeta     = cobradores.reduce((s, x) => s + x.metaTarget, 0)
      const totPactados = cobradores.reduce((s, x) => s + x.scheduleCount, 0)
      const totCobrados = cobradores.reduce((s, x) => s + x.cobradosCount, 0)
      const totCobPct   = totPactado > 0 ? Math.round((totCobrado / totPactado) * 100) : 0
      const totMetaPct  = totMeta > 0 ? Math.round((totColoc / totMeta) * 100) : 0

      const rows = cobradores.map((r, i) => {
        const tdBranch = showBranch ? `<td>${r.branchNombre ?? '—'}</td>` : ''
        const cbCls = r.cobranzaPct >= 90 ? 'cobrado' : r.cobranzaPct < 50 ? 'vencido' : ''
        const mtCls = r.metaPct >= 100 ? 'cobrado' : r.metaPct < 40 ? 'pendiente' : ''
        return `
          <tr class="${i % 2 === 1 ? 'alt' : ''}">
            <td>${r.nombre}</td>
            <td>${r.rolLabel}</td>
            ${tdBranch}
            <td class="center">${r.cobradosCount} / ${r.scheduleCount}</td>
            <td class="center ${cbCls}">${r.cobranzaPct}%</td>
            <td class="right">${fmt(r.totalCobrado)}</td>
            <td class="right">${fmt(r.totalAPagar)}</td>
            <td class="right">${fmt(r.colocacion)}</td>
            <td class="right">${fmt(r.metaTarget)}</td>
            <td class="center ${mtCls}">${r.metaPct}%</td>
          </tr>`
      }).join('')

      const extraCols = showBranch ? 1 : 0

      body = `
        <img class="brand-logo" src="${LOGO_URL}" alt="Logo" />
        <h2>Ruta Semanal — ${scopeLabel}</h2>
        <div class="meta">
          <span><strong>Semana:</strong> ${weekLabel}</span>
          <span><strong>Coordinadores:</strong> ${cobradores.length}</span>
          <span><strong>Cobros:</strong> ${totCobrados}/${totPactados}</span>
          <span class="${totCobPct >= 90 ? 'cobrado' : ''}"><strong>Cobranza:</strong> ${totCobPct}% · ${fmt(totCobrado)} de ${fmt(totPactado)}</span>
          <span class="${totMetaPct >= 100 ? 'cobrado' : ''}"><strong>Colocación:</strong> ${totMetaPct}% · ${fmt(totColoc)} de ${fmt(totMeta)}</span>
        </div>

        <div class="kpi">
          <div class="kpi-box">
            <div class="kpi-label">Cobranza Efectiva</div>
            <div class="kpi-val">${totCobPct}%</div>
            <div class="kpi-sub">${fmt(totCobrado)} de ${fmt(totPactado)}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">Meta de Colocación</div>
            <div class="kpi-val">${totMetaPct}%</div>
            <div class="kpi-sub">${fmt(totColoc)} de ${fmt(totMeta)} meta</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Coordinador</th>
              <th>Rol</th>
              ${thBranch}
              <th class="center">Cobros</th>
              <th class="center">Cobranza %</th>
              <th class="right">Cobrado</th>
              <th class="right">Pactado</th>
              <th class="right">Colocación</th>
              <th class="right">Meta</th>
              <th class="center">Meta %</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr>
              <td colspan="${2 + extraCols}">Total</td>
              <td class="center">${totCobrados} / ${totPactados}</td>
              <td class="center">${totCobPct}%</td>
              <td class="right">${fmt(totCobrado)}</td>
              <td class="right">${fmt(totPactado)}</td>
              <td class="right">${fmt(totColoc)}</td>
              <td class="right">${fmt(totMeta)}</td>
              <td class="center">${totMetaPct}%</td>
            </tr>
          </tfoot>
        </table>
      `
    }

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Ruta Semanal — ${weekLabel}</title>
  <style>${BASE_STYLE}</style>
</head>
<body>
  ${body}
  <div class="footer">Generado el ${generadoEl}</div>
</body>
</html>`

    const win = window.open('', '_blank', 'width=1100,height=750')
    if (!win) {
      alert('El navegador bloqueó la ventana emergente. Permite ventanas emergentes para esta página.')
      return
    }
    win.document.write(html)
    win.document.close()
    win.onload = () => win.print()
  }

  const hasData =
    (cobros !== undefined && cobros.length > 0) ||
    (cobradores !== undefined && cobradores.length > 0)
  if (!hasData) return null

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
