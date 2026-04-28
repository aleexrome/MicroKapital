'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Calendar, Filter, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { LoanType } from '@prisma/client'

export interface FiltrosBarProps {
  branches: Array<{ id: string; nombre: string }>
  cobradores: Array<{ id: string; nombre: string; branchId: string | null }>
  /** Si se pasa, oculta el selector de periodo (las metas semanales lo manejan aparte). */
  hidePeriodo?: boolean
}

const PERIODO_OPCIONES = [
  { value: 'hoy',            label: 'Hoy' },
  { value: 'semana',         label: 'Esta semana' },
  { value: 'semanaAnterior', label: 'Semana anterior' },
  { value: 'mes',            label: 'Este mes' },
  { value: 'mesAnterior',    label: 'Mes anterior' },
  { value: 'trimestre',      label: 'Trimestre' },
  { value: 'año',            label: 'Año' },
] as const

const TIPO_LABEL: Record<LoanType, string> = {
  SOLIDARIO:  'Solidario',
  INDIVIDUAL: 'Individual',
  AGIL:       'Ágil',
  FIDUCIARIO: 'Fiduciario',
}

export function FiltrosBar({ branches, cobradores, hidePeriodo = false }: FiltrosBarProps) {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  const periodo = params.get('periodo') ?? 'mes'
  const branchIds = params.get('branchIds')?.split(',').filter(Boolean) ?? []
  const cobradorIds = params.get('cobradorIds')?.split(',').filter(Boolean) ?? []
  const loanTypes = (params.get('loanTypes')?.split(',').filter(Boolean) ?? []) as LoanType[]

  const cobradoresVisibles = branchIds.length > 0
    ? cobradores.filter((c) => c.branchId && branchIds.includes(c.branchId))
    : cobradores

  function applyFilters(updates: Record<string, string | string[] | null>) {
    const next = new URLSearchParams(params.toString())
    for (const [key, val] of Object.entries(updates)) {
      if (val == null || (Array.isArray(val) && val.length === 0)) next.delete(key)
      else next.set(key, Array.isArray(val) ? val.join(',') : val)
    }
    startTransition(() => router.push(`?${next.toString()}`))
  }

  function toggleArrayValue(key: 'branchIds' | 'cobradorIds' | 'loanTypes', val: string) {
    const current =
      key === 'branchIds'   ? branchIds
      : key === 'cobradorIds' ? cobradorIds
      : loanTypes
    const next = current.includes(val) ? current.filter((x) => x !== val) : [...current, val]
    applyFilters({ [key]: next })
  }

  function clearAll() {
    applyFilters({ periodo: null, branchIds: null, cobradorIds: null, loanTypes: null })
  }

  const totalFiltros = branchIds.length + cobradorIds.length + loanTypes.length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {!hidePeriodo && (
          <div className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-card px-3 py-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <select
              value={periodo}
              onChange={(e) => applyFilters({ periodo: e.target.value })}
              disabled={pending}
              className="bg-transparent text-sm focus:outline-none [&>option]:bg-card [&>option]:text-foreground"
            >
              {PERIODO_OPCIONES.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen((v) => !v)}
          className="h-10"
        >
          <Filter className="h-4 w-4" />
          Filtros{totalFiltros > 0 ? ` (${totalFiltros})` : ''}
        </Button>

        {totalFiltros > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearAll}
            disabled={pending}
            className="h-10 text-muted-foreground"
          >
            <X className="h-4 w-4" />
            Limpiar
          </Button>
        )}
      </div>

      {open && (
        <div className="rounded-xl border border-border/60 bg-card p-4 space-y-4">
          {branches.length > 1 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Sucursal</p>
              <div className="flex flex-wrap gap-1.5">
                {branches.map((b) => {
                  const active = branchIds.includes(b.id)
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => toggleArrayValue('branchIds', b.id)}
                      disabled={pending}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        active
                          ? 'bg-primary-500 text-white'
                          : 'bg-secondary text-foreground hover:bg-secondary/80'
                      }`}
                    >
                      {b.nombre}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {cobradoresVisibles.length > 1 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Cobrador</p>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {cobradoresVisibles.map((c) => {
                  const active = cobradorIds.includes(c.id)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleArrayValue('cobradorIds', c.id)}
                      disabled={pending}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        active
                          ? 'bg-primary-500 text-white'
                          : 'bg-secondary text-foreground hover:bg-secondary/80'
                      }`}
                    >
                      {c.nombre}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Producto</p>
            <div className="flex flex-wrap gap-1.5">
              {(['SOLIDARIO', 'INDIVIDUAL', 'AGIL', 'FIDUCIARIO'] as LoanType[]).map((t) => {
                const active = loanTypes.includes(t)
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleArrayValue('loanTypes', t)}
                    disabled={pending}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? 'bg-primary-500 text-white'
                        : 'bg-secondary text-foreground hover:bg-secondary/80'
                    }`}
                  >
                    {TIPO_LABEL[t]}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Helper para que los page server components parseen los searchParams a
 * los tipos esperados por las queries.
 */
export function parseFiltrosFromSearchParams(sp: Record<string, string | string[] | undefined>) {
  const periodo = (typeof sp.periodo === 'string' ? sp.periodo : 'mes') as
    'hoy' | 'semana' | 'semanaAnterior' | 'mes' | 'mesAnterior' | 'trimestre' | 'año'

  function parseList(key: string): string[] {
    const v = sp[key]
    if (!v) return []
    if (Array.isArray(v)) return v
    return v.split(',').filter(Boolean)
  }

  const branchIds = parseList('branchIds')
  const cobradorIds = parseList('cobradorIds')
  const loanTypes = parseList('loanTypes') as LoanType[]

  return {
    periodo,
    filtros: {
      branchIds: branchIds.length ? branchIds : undefined,
      cobradorIds: cobradorIds.length ? cobradorIds : undefined,
      loanTypes: loanTypes.length ? loanTypes : undefined,
    },
  }
}
