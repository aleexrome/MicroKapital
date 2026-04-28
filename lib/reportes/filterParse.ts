import type { LoanType } from '@prisma/client'

/**
 * Parsea los searchParams de Next.js a los filtros que consumen las
 * queries del módulo Reportes. Server-safe (no usa hooks/cliente).
 *
 * Vive aquí en lugar de dentro de FiltrosBar.tsx ('use client') porque
 * Next.js 14 puede tener problemas al importar funciones desde un
 * archivo 'use client' a un server component — particularmente si la
 * función se ejecuta en SSR.
 */
export function parseFiltrosFromSearchParams(
  sp: Record<string, string | string[] | undefined>,
) {
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
