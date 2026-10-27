'use client'

import { Card } from '@/components/ui/card'
import { Clock, Package, CheckCircle2, AlertCircle, Building2, User as UserIcon, ArrowRight } from 'lucide-react'

type Corte = {
  id: string
  numeroCorte: number
  tipo: 'PARCIAL' | 'CONSOLIDADO'
  estado: 'ABIERTO' | 'ENTREGADO' | 'ACEPTADO' | 'RECHAZADO'
  totalAEntregar: string
  user?: { id: string; nombre: string; rol: string } | null
  receptor?: { id: string; nombre: string; rol: string } | null
  branch?: { id: string; nombre: string } | null
}

interface Props {
  cortes: Corte[]
  userId: string
}

const ESTADO_COLOR: Record<Corte['estado'], string> = {
  ABIERTO:   'bg-amber-500',
  ENTREGADO: 'bg-sky-500',
  ACEPTADO:  'bg-emerald-500',
  RECHAZADO: 'bg-red-500',
}

const ESTADO_ICON = {
  ABIERTO:   Clock,
  ENTREGADO: Package,
  ACEPTADO:  CheckCircle2,
  RECHAZADO: AlertCircle,
}

function money(n: string | number) {
  return `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

/**
 * Timeline del día:
 *   • Agrupa por sucursal
 *   • Por cada user (coord/concentradora/receptor): fila con sus parciales
 *     en puntos coloreados por estado
 *   • Resalta el user actual
 */
export function TimelineDia({ cortes, userId }: Props) {
  if (cortes.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Sin cortes hoy en tu sucursal.
      </Card>
    )
  }

  // Agrupar: branch → userId → cortes
  const porBranch = new Map<string, { branchNombre: string; usuarios: Map<string, { userNombre: string; userRol: string; parciales: Corte[]; consolidados: Corte[] }> }>()
  for (const c of cortes) {
    if (!c.branch || !c.user) continue
    const b = porBranch.get(c.branch.id) ?? { branchNombre: c.branch.nombre, usuarios: new Map() }
    porBranch.set(c.branch.id, b)
    const u = b.usuarios.get(c.user.id) ?? { userNombre: c.user.nombre, userRol: c.user.rol, parciales: [], consolidados: [] }
    if (c.tipo === 'PARCIAL') u.parciales.push(c)
    else u.consolidados.push(c)
    b.usuarios.set(c.user.id, u)
  }

  return (
    <div className="space-y-4">
      {Array.from(porBranch.entries()).map(([branchId, b]) => (
        <Card key={branchId} className="p-4 space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-border/50">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold">{b.branchNombre}</span>
          </div>

          <div className="space-y-2.5">
            {Array.from(b.usuarios.entries())
              .sort((a, b) => a[1].userNombre.localeCompare(b[1].userNombre))
              .map(([uid, u]) => {
                const esYo = uid === userId
                const totalParcial = u.parciales.filter(p => p.estado !== 'RECHAZADO').reduce((s, p) => s + Number(p.totalAEntregar), 0)
                const totalConsolidado = u.consolidados.filter(c => c.estado === 'ACEPTADO').reduce((s, c) => s + Number(c.totalAEntregar), 0)

                return (
                  <div
                    key={uid}
                    className={`flex items-start gap-3 py-1.5 ${esYo ? 'bg-primary/5 -mx-2 px-2 rounded-md' : ''}`}
                  >
                    <div className="flex items-center gap-1.5 min-w-[140px]">
                      <UserIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="truncate">
                        <div className="text-xs font-medium truncate">
                          {u.userNombre}
                          {esYo && <span className="ml-1 text-[10px] text-primary">(tú)</span>}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{u.userRol}</div>
                      </div>
                    </div>

                    {/* Parciales como puntos */}
                    <div className="flex items-center gap-1 flex-wrap flex-1">
                      {u.parciales.length === 0 ? (
                        <span className="text-[11px] text-muted-foreground italic">sin parciales</span>
                      ) : (
                        u.parciales.map((p) => {
                          const Icon = ESTADO_ICON[p.estado]
                          return (
                            <div
                              key={p.id}
                              className={`relative inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-white ${ESTADO_COLOR[p.estado]}`}
                              title={`Parcial #${p.numeroCorte} · ${p.estado} · ${money(p.totalAEntregar)}`}
                            >
                              <Icon className="h-2.5 w-2.5" />
                              <span className="tabular-nums">#{p.numeroCorte}</span>
                              <span className="opacity-80">{money(p.totalAEntregar)}</span>
                            </div>
                          )
                        })
                      )}
                    </div>

                    {/* Consolidados (si tiene) */}
                    {u.consolidados.length > 0 && (
                      <>
                        <ArrowRight className="h-3 w-3 text-muted-foreground mt-1" />
                        <div className="flex items-center gap-1 flex-wrap">
                          {u.consolidados.map((c) => {
                            const Icon = ESTADO_ICON[c.estado]
                            return (
                              <div
                                key={c.id}
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-white ${ESTADO_COLOR[c.estado]} border-2 border-white/30`}
                                title={`Consolidado #${c.numeroCorte} · ${c.estado} · ${money(c.totalAEntregar)} → ${c.receptor?.nombre ?? '?'}`}
                              >
                                <Icon className="h-2.5 w-2.5" />
                                <span>CON#{c.numeroCorte}</span>
                                <span className="opacity-80">{money(c.totalAEntregar)}</span>
                              </div>
                            )
                          })}
                        </div>
                      </>
                    )}

                    {/* Total del día */}
                    <div className="text-right min-w-[70px]">
                      <div className="text-[10px] text-muted-foreground">colectado</div>
                      <div className="text-xs font-semibold tabular-nums">{money(totalParcial)}</div>
                    </div>
                  </div>
                )
              })}
          </div>
        </Card>
      ))}

      {/* Leyenda */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
        <div className="flex items-center gap-1"><div className="h-2 w-2 rounded-full bg-amber-500" /> Abierto</div>
        <div className="flex items-center gap-1"><div className="h-2 w-2 rounded-full bg-sky-500" /> Entregado</div>
        <div className="flex items-center gap-1"><div className="h-2 w-2 rounded-full bg-emerald-500" /> Aceptado</div>
        <div className="flex items-center gap-1"><div className="h-2 w-2 rounded-full bg-red-500" /> Rechazado</div>
        <div className="flex items-center gap-1 ml-3"><div className="h-2 w-2 rounded-full bg-slate-500 border-2 border-white/30" /> Consolidado</div>
      </div>
    </div>
  )
}
