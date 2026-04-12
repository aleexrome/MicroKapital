'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface SolidarioLoan {
  id: string
  capital: number
  clientName: string
}

export interface SolidarioGroup {
  id: string
  nombre: string
  cobradorNombre?: string
  totalCapital: number
  integranteCount: number
  hasOverdue: boolean
  nextFecha?: string | null
  loans: SolidarioLoan[]
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(n)
}
function fmtDate(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function SolidarioGroupList({ groups }: { groups: SolidarioGroup[] }) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (groups.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No hay grupos Solidario activos
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {groups.map((grupo) => {
        const isOpen = openIds.has(grupo.id)
        return (
          <div
            key={grupo.id}
            className={cn(
              'border rounded-lg overflow-hidden',
              grupo.hasOverdue ? 'border-red-200' : 'border-border',
            )}
          >
            {/* ── Header (always visible, click to toggle) ── */}
            <button
              type="button"
              onClick={() => toggle(grupo.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
            >
              {isOpen
                ? <ChevronDown  className="h-4 w-4 shrink-0 text-muted-foreground" />
                : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              }
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/grupos/${grupo.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="font-semibold truncate hover:underline"
                  >
                    {grupo.nombre}
                  </Link>
                  {grupo.hasOverdue && (
                    <Badge variant="error" className="text-xs shrink-0">Con vencidos</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {grupo.cobradorNombre && `${grupo.cobradorNombre} · `}
                  {grupo.integranteCount} integrante{grupo.integranteCount !== 1 ? 's' : ''}
                  {grupo.nextFecha && ` · Próx. ${fmtDate(grupo.nextFecha)}`}
                </p>
              </div>
              <span className="text-sm font-semibold shrink-0">{fmtMoney(grupo.totalCapital)}</span>
            </button>

            {/* ── Expanded: client list + Reunión button ── */}
            {isOpen && (
              <div className="border-t border-border/60">
                <div className="px-4 py-2 flex items-center justify-end bg-muted/20">
                  <Button asChild size="sm" variant="outline" className="h-7 text-xs px-2">
                    <Link href={`/cobros/grupo/${grupo.id}`} onClick={(e) => e.stopPropagation()}>
                      <Users className="h-3 w-3 mr-1" />Reunión
                    </Link>
                  </Button>
                </div>
                <div className="divide-y divide-border/40">
                  {grupo.loans.map((loan) => (
                    <Link
                      key={loan.id}
                      href={`/prestamos/${loan.id}`}
                      className="flex items-center justify-between px-6 py-2.5 hover:bg-muted/30 transition-colors"
                    >
                      <span className="text-sm text-gray-800">{loan.clientName}</span>
                      <span className="text-sm font-medium text-gray-500">{fmtMoney(loan.capital)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
