'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { ChevronDown, ChevronUp, History } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { DesgloseCorteDialog } from './DesgloseCorteDialog'

type Corte = {
  id: string
  fecha: string
  numeroCorte: number
  tipo: 'PARCIAL' | 'CONSOLIDADO'
  estado: 'ABIERTO' | 'ENTREGADO' | 'ACEPTADO' | 'RECHAZADO'
  totalAEntregar: string
  user?: { id: string; nombre: string } | null
  receptor?: { id: string; nombre: string } | null
}

const COLOR: Record<Corte['estado'], string> = {
  ABIERTO:   'bg-amber-500',
  ENTREGADO: 'bg-sky-500',
  ACEPTADO:  'bg-emerald-500',
  RECHAZADO: 'bg-red-500',
}

function money(n: string | number) {
  return `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

/**
 * Vista read-only de cortes de días pasados. Muestra una card por día
 * agrupando parciales y consolidados que pertenecen al usuario (propios
 * y los dirigidos a él como receptor).
 */
export function HistoricoCortes({ cortes, canAudit = false }: { cortes: Corte[]; canAudit?: boolean }) {
  const [abierto, setAbierto] = useState(false)
  const [desgloseId, setDesgloseId] = useState<string | null>(null)

  // Agrupar por fecha (día civil)
  const porFecha = new Map<string, Corte[]>()
  for (const c of cortes) {
    const key = c.fecha.slice(0, 10)
    porFecha.set(key, [...(porFecha.get(key) ?? []), c])
  }

  const diasOrdenados = Array.from(porFecha.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))  // desc
  const vacio = diasOrdenados.length === 0

  return (
    <section className="space-y-3">
      <button
        onClick={() => !vacio && setAbierto((x) => !x)}
        disabled={vacio}
        className="flex items-center justify-between w-full text-sm font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition disabled:cursor-default disabled:opacity-70"
      >
        <span className="flex items-center gap-2">
          <History className="h-4 w-4" />
          Días pasados ({diasOrdenados.length})
        </span>
        {!vacio && (abierto ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
      </button>

      {vacio && (
        <Card className="p-4 text-sm text-muted-foreground text-center">
          No tienes cortes registrados en los últimos 14 días. Cuando cierres parciales o consolidados aparecerán aquí.
        </Card>
      )}

      {!vacio && abierto && (
        <div className="space-y-3">
          {diasOrdenados.map(([fechaKey, cs]) => {
            const d = new Date(fechaKey + 'T12:00:00')
            const label = format(d, "EEEE d 'de' MMMM yyyy", { locale: es })
            const parciales = cs.filter((c) => c.tipo === 'PARCIAL')
            const consolidados = cs.filter((c) => c.tipo === 'CONSOLIDADO')
            const totalAceptado = cs
              .filter((c) => c.estado === 'ACEPTADO')
              .reduce((s, c) => s + Number(c.totalAEntregar), 0)

            return (
              <Card key={fechaKey} className="p-4 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="font-medium capitalize">{label}</div>
                  <div className="text-sm text-muted-foreground">
                    Total aceptado: <span className="font-semibold text-foreground tabular-nums">{money(totalAceptado)}</span>
                  </div>
                </div>

                {parciales.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-2 mb-1">Parciales</div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {parciales.map((p) => {
                        const common = `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-white ${COLOR[p.estado]}`
                        const title = `${p.user?.nombre ?? ''} #${p.numeroCorte} · ${p.estado}${canAudit ? ' · Click para ver desglose' : ''}`
                        const content = (
                          <>
                            <span>{p.user?.nombre ?? 'yo'} #{p.numeroCorte}</span>
                            <span className="opacity-80 tabular-nums">{money(p.totalAEntregar)}</span>
                          </>
                        )
                        return canAudit ? (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setDesgloseId(p.id)}
                            className={`${common} cursor-pointer hover:opacity-90 hover:ring-2 hover:ring-white/40 transition`}
                            title={title}
                          >
                            {content}
                          </button>
                        ) : (
                          <div key={p.id} className={common} title={title}>
                            {content}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {consolidados.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-2 mb-1">Consolidados</div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {consolidados.map((c) => {
                        const common = `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-white ${COLOR[c.estado]} border-2 border-white/30`
                        const title = `CON#${c.numeroCorte} · ${c.estado} · → ${c.receptor?.nombre ?? '—'}${canAudit ? ' · Click para ver desglose' : ''}`
                        const content = (
                          <>
                            <span>CON#{c.numeroCorte}</span>
                            <span className="opacity-80 tabular-nums">{money(c.totalAEntregar)}</span>
                            {c.receptor && <span className="opacity-70">→ {c.receptor.nombre.split(' ')[0]}</span>}
                          </>
                        )
                        return canAudit ? (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setDesgloseId(c.id)}
                            className={`${common} cursor-pointer hover:opacity-90 hover:ring-2 hover:ring-white/40 transition`}
                            title={title}
                          >
                            {content}
                          </button>
                        ) : (
                          <div key={c.id} className={common} title={title}>
                            {content}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {canAudit && (
        <DesgloseCorteDialog
          corteId={desgloseId}
          onClose={() => setDesgloseId(null)}
        />
      )}
    </section>
  )
}
