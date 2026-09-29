'use client'

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  TrendingUp, CheckCircle2, Clock, AlertCircle, CircleDot,
} from 'lucide-react'
import { formatMoney } from '@/lib/utils'
import {
  ImprimirRutaButton,
  type RutaCobroRow, type RutaColocacionRow,
} from '@/components/rutas/ImprimirRutaButton'

const ESTADO_LABEL: Record<string, string> = {
  PAID: 'Cobrado', ADVANCE: 'Cobrado', PARTIAL: 'Parcial',
  PENDING: 'Pendiente', OVERDUE: 'Vencido', FINANCIADO: 'Financiado',
}
const TIPO_LABEL: Record<string, string> = {
  SOLIDARIO: 'Solidario', INDIVIDUAL: 'Individual',
  AGIL: 'Ágil', FIDUCIARIO: 'Fiduciario',
}

type FiltroCobro = 'todos' | 'pendientes' | 'pagados' | 'prepagados' | 'financiados'

// La clasificación en tabs deriva del par (estado, prePagado, financiado).
// La misma lógica se usa para pintar la lista y para armar el subset que
// va al print, así el reporte impreso siempre refleja la vista actual.
// FINANCIADO tiene su propio chip porque no cuenta en meta ni cobrado
// (se financió con renovación, no entró dinero).
function categoria(row: RutaCobroRow): 'pendiente' | 'pagado' | 'prepagado' | 'financiado' {
  if (row.financiado || row.estado === 'FINANCIADO') return 'financiado'
  if (row.prePagado) return 'prepagado'
  if (row.estado === 'PAID' || row.estado === 'ADVANCE') return 'pagado'
  // PENDING, OVERDUE, PARTIAL → todavía requieren visita de la cobradora
  return 'pendiente'
}

interface Props {
  weekLabel: string
  scopeLabel: string
  cobros: RutaCobroRow[]
  colocaciones: RutaColocacionRow[]
  colocacionTotal: number
  metaTarget: number
  metaPct: number
  headerLabel: string
  // Meta / cobrado calculados en el server con la regla de negocio
  // (excluye prepagados y financiados; cobrado = payments intra-semana).
  // Se usan para el KPI del print cuando el filtro es "todos" — así el
  // reporte impreso muestra los mismos números que la UI web.
  totalAPagarReal: number
  totalCobradoReal: number
  cobranzaPctReal: number
}

export function CobrosFilterableSection({
  weekLabel, scopeLabel, cobros, colocaciones,
  colocacionTotal, metaTarget, metaPct, headerLabel,
  totalAPagarReal, totalCobradoReal, cobranzaPctReal,
}: Props) {
  const [filtro, setFiltro] = useState<FiltroCobro>('todos')

  const conteos = useMemo(() => {
    let pend = 0, pag = 0, pre = 0, fin = 0
    for (const r of cobros) {
      const c = categoria(r)
      if (c === 'pendiente')       pend++
      else if (c === 'pagado')     pag++
      else if (c === 'prepagado')  pre++
      else                         fin++
    }
    return { todos: cobros.length, pendientes: pend, pagados: pag, prepagados: pre, financiados: fin }
  }, [cobros])

  const cobrosFiltrados = useMemo(() => {
    if (filtro === 'todos')       return cobros
    if (filtro === 'pendientes')  return cobros.filter((r) => categoria(r) === 'pendiente')
    if (filtro === 'pagados')     return cobros.filter((r) => categoria(r) === 'pagado')
    if (filtro === 'prepagados')  return cobros.filter((r) => categoria(r) === 'prepagado')
    return cobros.filter((r) => categoria(r) === 'financiado')
  }, [cobros, filtro])

  // Totales para el sub-header y para el print reflejan el filtro activo,
  // así el "Total" impreso siempre cuadra con la lista mostrada.
  const totalAPagar = useMemo(
    () => cobrosFiltrados.reduce((acc, r) => acc + r.montoEsperado, 0),
    [cobrosFiltrados],
  )
  const totalCobrado = useMemo(
    () => cobrosFiltrados.reduce((acc, r) => acc + r.montoCobrado, 0),
    [cobrosFiltrados],
  )
  const cobranzaPct = totalAPagar > 0 ? Math.round((totalCobrado / totalAPagar) * 100) : 0

  const scopeConFiltro =
    filtro === 'todos'        ? scopeLabel
    : filtro === 'pendientes' ? `${scopeLabel} · Pendientes`
    : filtro === 'pagados'    ? `${scopeLabel} · Pagados`
    : filtro === 'prepagados' ? `${scopeLabel} · Pre-pagados`
    :                           `${scopeLabel} · Financiados`

  return (
    <>
      <div>
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-primary-600" />
          {headerLabel}
          {cobros.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">({conteos.todos} pactados)</span>
          )}
        </h2>

        {/* Tabs de filtro — mismo estilo que los chips de DayFilter */}
        <div className="flex flex-wrap gap-2 mb-3">
          <FiltroChip label="Todos"       count={conteos.todos}       active={filtro === 'todos'}       onClick={() => setFiltro('todos')} />
          <FiltroChip label="Pendientes"  count={conteos.pendientes}  active={filtro === 'pendientes'}  onClick={() => setFiltro('pendientes')}  tone="pendiente" />
          <FiltroChip label="Pagados"     count={conteos.pagados}     active={filtro === 'pagados'}     onClick={() => setFiltro('pagados')}     tone="pagado" />
          <FiltroChip label="Pre-pagados" count={conteos.prepagados}  active={filtro === 'prepagados'}  onClick={() => setFiltro('prepagados')}  tone="prepagado" />
          {conteos.financiados > 0 && (
            <FiltroChip label="Financiados" count={conteos.financiados} active={filtro === 'financiados'} onClick={() => setFiltro('financiados')} tone="financiado" />
          )}
        </div>

        {cobrosFiltrados.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center border rounded-lg">
            {filtro === 'todos' ? 'Sin cobros pactados esta semana'
             : filtro === 'pendientes' ? 'No hay cobros pendientes'
             : filtro === 'pagados'    ? 'Todavía no hay cobros pagados'
             : filtro === 'prepagados' ? 'No hay cobros pre-pagados'
             : 'No hay pagos financiados esta semana'}
          </p>
        ) : (
          <>
            <div className="border rounded-xl overflow-hidden divide-y bg-white">
              {cobrosFiltrados.map((r, i) => {
                const cat = categoria(r)
                const isFinanciado = cat === 'financiado'
                const isCobrado    = cat === 'pagado'
                const isPartial    = !isCobrado && !isFinanciado && !r.prePagado && r.estado === 'PARTIAL'
                const isPrePagado  = cat === 'prepagado'
                const isVencido    = !isCobrado && !isPartial && !isPrePagado && !isFinanciado && r.estado === 'OVERDUE'
                return (
                  <div
                    key={`${r.clientNombre}-${i}`}
                    className={`flex items-center gap-3 px-4 py-3 text-sm ${isCobrado || isPrePagado || isFinanciado ? 'opacity-60' : ''}`}
                  >
                    <RowIcon isCobrado={isCobrado} isPartial={isPartial} isVencido={isVencido} isFinanciado={isFinanciado} />
                    <span className="flex-1 min-w-0 truncate font-medium">{r.clientNombre}</span>
                    <Badge variant="outline" className="text-xs shrink-0">{TIPO_LABEL[r.tipo] ?? r.tipo}</Badge>
                    <span className="font-semibold w-20 text-right shrink-0">{formatMoney(r.montoEsperado)}</span>
                    <span className={`text-xs w-20 text-right shrink-0 ${
                      isFinanciado ? 'italic text-violet-700 font-medium'
                      : isCobrado ? 'text-green-600 font-medium'
                      : isPartial ? 'text-amber-600 font-medium'
                      : isPrePagado ? 'italic text-muted-foreground'
                      : 'text-muted-foreground'
                    }`}>
                      {isFinanciado ? 'Financiado'
                       : isCobrado || isPartial ? formatMoney(r.montoCobrado)
                       : isPrePagado ? 'Pre-pagado'
                       : ESTADO_LABEL[r.estado] ?? r.estado}
                    </span>
                  </div>
                )
              })}
            </div>
            {/* Totales del subset filtrado. Los financiados no muestran
                "cobrada" porque ese dinero no entró — se financió con
                el nuevo crédito. */}
            <div className="flex justify-end gap-6 mt-2 text-xs text-muted-foreground">
              <span>
                {filtro === 'financiados' ? 'Suma financiada' : 'Suma pactada'}:{' '}
                <strong className={filtro === 'financiados' ? 'text-violet-700' : 'text-gray-800'}>
                  {formatMoney(totalAPagar)}
                </strong>
              </span>
              {filtro !== 'prepagados' && filtro !== 'financiados' && (
                <span>Suma cobrada: <strong className="text-green-700">{formatMoney(totalCobrado)}</strong></span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Print del subset actual. Cuando filtro="todos" pasamos los
          valores REALES del server (meta y cobrado sin prepagados ni
          financiados) para que el KPI del archivo impreso cuadre con
          el KPI de la UI web. En filtros específicos (pagados / etc)
          seguimos con la suma del subset filtrado. */}
      <div className="flex justify-center pt-2">
        <ImprimirRutaButton
          weekLabel={weekLabel}
          scopeLabel={scopeConFiltro}
          cobros={cobrosFiltrados}
          colocaciones={filtro === 'todos' ? colocaciones : []}
          totalAPagar={filtro === 'todos' ? totalAPagarReal : totalAPagar}
          totalCobrado={filtro === 'todos' ? totalCobradoReal : totalCobrado}
          colocacionTotal={filtro === 'todos' ? colocacionTotal : 0}
          metaTarget={filtro === 'todos' ? metaTarget : 0}
          cobranzaPct={filtro === 'todos' ? cobranzaPctReal : cobranzaPct}
          metaPct={filtro === 'todos' ? metaPct : 0}
        />
      </div>
    </>
  )
}

function RowIcon({
  isCobrado, isPartial, isVencido, isFinanciado,
}: { isCobrado: boolean; isPartial: boolean; isVencido: boolean; isFinanciado: boolean }) {
  if (isFinanciado) return <CircleDot className="h-4 w-4 text-violet-500 shrink-0" />
  if (isCobrado) return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
  if (isPartial) return <CircleDot className="h-4 w-4 text-amber-500 shrink-0" />
  if (isVencido) return <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
  return <Clock className="h-4 w-4 text-gray-400 shrink-0" />
}

function FiltroChip({
  label, count, active, onClick, tone,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
  tone?: 'pendiente' | 'pagado' | 'prepagado' | 'financiado'
}) {
  const base = 'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors inline-flex items-center gap-1.5'
  const toneClasses = active
    ? tone === 'pagado'      ? 'bg-green-600 border-green-600 text-white'
    : tone === 'pendiente'   ? 'bg-red-500 border-red-500 text-white'
    : tone === 'prepagado'   ? 'bg-gray-500 border-gray-500 text-white'
    : tone === 'financiado'  ? 'bg-violet-600 border-violet-600 text-white'
    :                          'bg-primary-600 border-primary-600 text-white'
    : 'bg-white border-input text-gray-700 hover:bg-gray-50'
  return (
    <button type="button" onClick={onClick} className={`${base} ${toneClasses}`}>
      {label}
      <span className={`text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${
        active ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-600'
      }`}>{count}</span>
    </button>
  )
}
