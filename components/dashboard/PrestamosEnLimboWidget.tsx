'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronUp, Clock, AlertTriangle, AlertCircle, Activity } from 'lucide-react'
import { formatMoney } from '@/lib/utils'
import type { LimboBuckets, PrestamoEnLimboDetalle } from '@/lib/limbo-dashboard'

interface Props {
  buckets: LimboBuckets
  detalle: PrestamoEnLimboDetalle[]
}

const BUCKET_META = {
  recientes: { label: 'Recientes',   sub: '< 12h',     color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', icon: Activity },
  demorados: { label: 'Demorados',  sub: '12–48h',    color: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-500/10',   icon: Clock },
  atrasados: { label: 'Atrasados',  sub: '48–72h',    color: 'text-orange-600 dark:text-orange-400',   bg: 'bg-orange-500/10',  icon: AlertTriangle },
  criticos:  { label: 'CRÍTICO',    sub: '> 72h',     color: 'text-red-600 dark:text-red-400',         bg: 'bg-red-500/10',     icon: AlertCircle },
} as const

type BucketKey = keyof typeof BUCKET_META

export function PrestamosEnLimboWidget({ buckets, detalle }: Props) {
  const [openBucket, setOpenBucket] = useState<BucketKey | null>(null)

  const total = buckets.recientes.count + buckets.demorados.count + buckets.atrasados.count + buckets.criticos.count

  if (total === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Préstamos en limbo
        </h3>
        <p className="text-xs text-muted-foreground">Sin préstamos pendientes de activar. ✨</p>
      </div>
    )
  }

  const order: BucketKey[] = ['recientes', 'demorados', 'atrasados', 'criticos']

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        Préstamos en limbo
        <span className="text-xs text-muted-foreground font-normal">({total} total)</span>
      </h3>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {order.map((key) => {
          const meta = BUCKET_META[key]
          const Icon = meta.icon
          const stat = buckets[key]
          const isOpen = openBucket === key
          const empty = stat.count === 0
          return (
            <button
              key={key}
              disabled={empty}
              onClick={() => setOpenBucket(isOpen ? null : key)}
              className={`rounded-lg border ${empty ? 'border-border/40 opacity-50' : 'border-border hover:border-foreground/30'} ${meta.bg} p-3 text-left transition-all ${isOpen ? 'ring-2 ring-foreground/20' : ''}`}
            >
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                <span className={meta.color}>{meta.label}</span>
                <span className="text-muted-foreground/70 ml-auto text-[10px]">{meta.sub}</span>
              </div>
              <p className={`text-2xl font-bold mt-1 ${meta.color}`}>{stat.count}</p>
              <p className="text-[10px] text-muted-foreground">{formatMoney(stat.totalCapital)}</p>
            </button>
          )
        })}
      </div>

      {openBucket && buckets[openBucket].count > 0 && (
        <div className="border-t border-border/50 pt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground">
              {BUCKET_META[openBucket].label} ({buckets[openBucket].count})
            </p>
            <button
              onClick={() => setOpenBucket(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
              aria-label="Cerrar detalle"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {detalle
              .filter((d) => d.bucket === openBucket)
              .map((d) => (
                <Link
                  key={d.id}
                  href={`/prestamos/${d.id}`}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-accent text-xs transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{d.clienteNombre}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {d.cobradorNombre} · {d.branchNombre}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold">{formatMoney(d.capital)}</p>
                    <p className={`text-[10px] ${BUCKET_META[d.bucket].color}`}>{d.horas}h</p>
                  </div>
                </Link>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
