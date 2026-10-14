'use client'

import { X, Info, CheckCircle2, Clock, Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface ArqueoCapturaDTO {
  id:                           string
  user:                         { id: string; nombre: string; rol: string; branch: { id: string; nombre: string } | null }
  capturadoAt:                  string | null
  canceladoAt:                  string | null
  /** Heartbeat — última vez que el user tuvo la pantalla congelada abierta.
   *  Null = nunca abrió. En línea = < 30s desde ahora. */
  ultimoVistoAt?:               string | null
  totalEfectivoDeclarado:       number | null
  totalTransferenciasDeclarado: number | null
  totalEfectivoEsperado:        number | null
  totalTransferenciasEsperado:  number | null
  desgloseEfectivo:             unknown // JSONB array {denominacion, cantidad, subtotal}
  semanaMKSabado:               string | null
  arqueo?: {
    id:             string
    tipo:           string
    lanzadoAt:      string
    lanzadoPor:     { nombre: string; rol: string; branch: { nombre: string } | null } | null
    canceladoAt:    string | null
    canceladoRazon: string | null
    branchNombre:   string | null
  }
}

interface Props {
  captura: ArqueoCapturaDTO
  onClose: () => void
}

/**
 * Dialog con el detalle completo de UNA captura de arqueo. Muestra:
 *   - Metadatos del arqueo padre (quién lanzó, cuándo, tipo).
 *   - Si está pendiente/cancelado: mensaje.
 *   - Si está capturado: 3 columnas (Arqueo | Esperado | Diferencia)
 *     para efectivo + transferencias + totales.
 *   - Desglose por denominación (si existe).
 */
export function ArqueoDetalleDialog({ captura, onClose }: Props) {
  const esCancelado = !!(captura.canceladoAt || captura.arqueo?.canceladoAt)
  const esPendiente = !esCancelado && !captura.capturadoAt
  const esCapturado = !!captura.capturadoAt && !esCancelado

  const diffEf = (captura.totalEfectivoDeclarado ?? 0) - (captura.totalEfectivoEsperado ?? 0)
  const diffTr = (captura.totalTransferenciasDeclarado ?? 0) - (captura.totalTransferenciasEsperado ?? 0)
  const diffTotal = diffEf + diffTr

  const desglose = Array.isArray(captura.desgloseEfectivo)
    ? (captura.desgloseEfectivo as { denominacion: number; cantidad: number; subtotal?: number }[])
    : []

  function colorFor(diff: number) {
    if (Math.abs(diff) < 0.01) return 'text-emerald-600'
    if (diff < 0)              return 'text-red-600'
    return 'text-amber-600'
  }

  function fmt(n: number | null | undefined) {
    if (n === null || n === undefined) return '—'
    return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white">
          <div>
            <h2 className="font-semibold text-gray-900">{captura.user.nombre}</h2>
            <p className="text-xs text-muted-foreground">
              {captura.user.rol} · {captura.user.branch?.nombre ?? 'Sin sucursal'}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Metadata del arqueo */}
          {captura.arqueo && (
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs text-gray-700 flex items-start gap-2">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-gray-400" />
              <div className="flex-1">
                <p>
                  <span className="text-gray-500">Lanzado por: </span>
                  <strong>{captura.arqueo.lanzadoPor?.nombre ?? '—'}</strong>
                  {captura.arqueo.lanzadoPor?.branch?.nombre && <> · {captura.arqueo.lanzadoPor.branch.nombre}</>}
                </p>
                <p>
                  <span className="text-gray-500">Fecha / hora: </span>
                  {new Date(captura.arqueo.lanzadoAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
                <p>
                  <span className="text-gray-500">Tipo: </span>
                  {captura.arqueo.tipo === 'GLOBAL' ? 'Global' : captura.arqueo.tipo === 'BRANCH' ? `Sucursal — ${captura.arqueo.branchNombre}` : 'Individual'}
                </p>
                {captura.arqueo.canceladoAt && (
                  <p className="mt-1 text-red-600">
                    Arqueo cancelado — {captura.arqueo.canceladoRazon ?? 'sin razón'}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Estado */}
          {esPendiente && (
            <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <Clock className="h-4 w-4" />
              Captura pendiente — el usuario no ha enviado todavía.
            </div>
          )}
          {esCancelado && (
            <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">
              <Ban className="h-4 w-4" />
              Captura cancelada
              {captura.capturadoAt && ' (capturado antes de cancelar)'}
            </div>
          )}
          {esCapturado && (
            <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              <CheckCircle2 className="h-4 w-4" />
              Capturado el {new Date(captura.capturadoAt!).toLocaleString('es-MX')}
            </div>
          )}

          {/* Comparativa */}
          {esCapturado && (
            <>
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-600">
                    <tr>
                      <th className="text-left px-3 py-2">Concepto</th>
                      <th className="text-right px-3 py-2">Arqueo</th>
                      <th className="text-right px-3 py-2">Esperado</th>
                      <th className="text-right px-3 py-2">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-gray-200">
                      <td className="px-3 py-2">Efectivo</td>
                      <td className="text-right px-3 py-2 font-mono">{fmt(captura.totalEfectivoDeclarado)}</td>
                      <td className="text-right px-3 py-2 font-mono text-gray-500">{fmt(captura.totalEfectivoEsperado)}</td>
                      <td className={`text-right px-3 py-2 font-mono font-semibold ${colorFor(diffEf)}`}>
                        {diffEf >= 0 ? '+' : ''}{fmt(diffEf)}
                      </td>
                    </tr>
                    <tr className="border-t border-gray-200">
                      <td className="px-3 py-2">Transferencias</td>
                      <td className="text-right px-3 py-2 font-mono">{fmt(captura.totalTransferenciasDeclarado)}</td>
                      <td className="text-right px-3 py-2 font-mono text-gray-500">{fmt(captura.totalTransferenciasEsperado)}</td>
                      <td className={`text-right px-3 py-2 font-mono font-semibold ${colorFor(diffTr)}`}>
                        {diffTr >= 0 ? '+' : ''}{fmt(diffTr)}
                      </td>
                    </tr>
                    <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                      <td className="px-3 py-2">Total</td>
                      <td className="text-right px-3 py-2 font-mono">
                        {fmt((captura.totalEfectivoDeclarado ?? 0) + (captura.totalTransferenciasDeclarado ?? 0))}
                      </td>
                      <td className="text-right px-3 py-2 font-mono text-gray-500">
                        {fmt((captura.totalEfectivoEsperado ?? 0) + (captura.totalTransferenciasEsperado ?? 0))}
                      </td>
                      <td className={`text-right px-3 py-2 font-mono ${colorFor(diffTotal)}`}>
                        {diffTotal >= 0 ? '+' : ''}{fmt(diffTotal)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Desglose */}
              {desglose.length > 0 && (
                <details className="rounded-lg border border-gray-200 overflow-hidden">
                  <summary className="px-3 py-2 bg-gray-50 cursor-pointer text-sm font-medium text-gray-700">
                    Desglose por denominación
                  </summary>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-600">
                      <tr>
                        <th className="text-left px-3 py-2">Denominación</th>
                        <th className="text-right px-3 py-2">Cantidad</th>
                        <th className="text-right px-3 py-2">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {desglose.map((d, i) => (
                        <tr key={i} className="border-t border-gray-200">
                          <td className="px-3 py-1.5 font-mono">
                            {d.denominacion < 1 ? `${(d.denominacion * 100).toFixed(0)}¢` : `$${d.denominacion}`}
                          </td>
                          <td className="text-right px-3 py-1.5 font-mono">{d.cantidad}</td>
                          <td className="text-right px-3 py-1.5 font-mono">
                            {fmt(d.subtotal ?? d.denominacion * d.cantidad)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </>
          )}

          <div className="pt-2">
            <Button variant="outline" className="w-full" onClick={onClose}>Cerrar</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
