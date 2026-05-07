/**
 * Helpers de formato exclusivos para los PDFs del módulo de contratos.
 *
 * No usamos `lib/utils.ts`/`formatMoney` porque las plantillas físicas
 * tienen convenciones particulares (símbolo `°°` para los centavos,
 * fechas en español todo en mayúsculas, etc.) que no queremos imponer
 * al resto de la app.
 */

const MESES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
]

/**
 * Formato monetario al estilo de las plantillas físicas.
 * 28000     → "$ 28,000.°°"
 * 28500.50  → "$ 28,500.50"
 * 0         → "$ 0.°°"
 */
export function formatCurrency(n: number): string {
  if (!Number.isFinite(n)) return '$ 0.°°'
  const entero   = Math.floor(Math.abs(n))
  const centavos = Math.round((Math.abs(n) - entero) * 100)
  const enteroFmt = entero.toLocaleString('en-US')
  const centsPart = centavos === 0 ? '°°' : String(centavos).padStart(2, '0')
  const sign = n < 0 ? '-' : ''
  return `${sign}$ ${enteroFmt}.${centsPart}`
}

/**
 * Formato monetario simple (sin el "°°" decorativo). Útil para tablas
 * donde queremos separadores de miles y siempre 2 decimales.
 */
export function formatCurrencyPlain(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

/**
 * Fecha larga en español todo en mayúsculas para los pagarés.
 * 2026-04-27 → "27 DE ABRIL DE 2026"
 */
export function formatDateLong(d: Date): string {
  const dia = d.getDate()
  const mes = MESES[d.getMonth()] ?? ''
  const año = d.getFullYear()
  return `${dia} DE ${mes} DE ${año}`
}

/**
 * Fecha corta para el header de cada columna del control de pagos.
 * 2026-04-27 → "27/04/26"
 */
export function formatDateShort(d: Date): string {
  const dia = String(d.getDate()).padStart(2, '0')
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const año = String(d.getFullYear()).slice(-2)
  return `${dia}/${mes}/${año}`
}

/**
 * Fecha de capítulo "lugar y fecha" del contrato.
 * 2026-04-27 → "A LOS 27 DÍAS DEL MES DE ABRIL DE 2026"
 */
export function formatDateContrato(d: Date): string {
  return `A LOS ${d.getDate()} DÍAS DEL MES DE ${MESES[d.getMonth()] ?? ''} DE ${d.getFullYear()}`
}
