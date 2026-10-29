'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, Clock, Send, XCircle, Building2 } from 'lucide-react'
import { formatMoney } from '@/lib/utils'
import type { SucursalPendientesCortes } from '@/lib/cortes'

const ROL_LABEL: Record<string, string> = {
  COBRADOR:      'Cobradora',
  COORDINADOR:   'Coord',
  GERENTE:       'Gerente',
  GERENTE_ZONAL: 'GZ',
  MESA_CONTROL:  'Mesa Control',
}

const ESTADO_META: Record<'ABIERTO' | 'ENTREGADO' | 'RECHAZADO', { label: string; className: string; icon: typeof Clock }> = {
  ABIERTO:    { label: 'Sin entregar',       className: 'bg-rose-500/15 text-rose-300 border-rose-500/40', icon: AlertCircle },
  ENTREGADO:  { label: 'Esperando aceptación', className: 'bg-amber-500/15 text-amber-300 border-amber-500/40', icon: Send },
  RECHAZADO:  { label: 'Rechazado',          className: 'bg-rose-500/15 text-rose-300 border-rose-500/40', icon: XCircle },
}

function colorDiasAtraso(dias: number) {
  if (dias >= 3) return 'text-rose-400 font-bold'
  if (dias >= 2) return 'text-amber-400 font-semibold'
  return 'text-amber-300'
}

export function PendientesCortesSection({ sucursales }: { sucursales: SucursalPendientesCortes[] }) {
  const totalCobradores = sucursales.reduce((s, b) => s + b.cobradores.length, 0)
  if (totalCobradores === 0) {
    return (
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-emerald-300">
            <Clock className="h-4 w-4" />
            Pendientes de corte
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Todos cerraron sus cortes de días anteriores. 🎉
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-400" />
          Pendientes de corte
          <span className="text-xs font-normal text-muted-foreground">
            ({totalCobradores} cobrador{totalCobradores !== 1 ? 'es' : ''})
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Cortes de días anteriores que todavía no están ACEPTADOS. Agrupados por sucursal, ordenados por días de atraso.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {sucursales.map((suc) => (
          <div key={suc.branchId} className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Building2 className="h-4 w-4 text-primary-300" />
              {suc.branchNombre}
              <span className="text-xs font-normal text-muted-foreground">
                ({suc.cobradores.length})
              </span>
            </div>
            <div className="space-y-2">
              {suc.cobradores.map((cob) => (
                <div
                  key={cob.userId}
                  className="rounded-md border border-border/60 bg-background/40 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <p className="text-sm font-medium">{cob.nombre}</p>
                      <p className="text-[11px] text-muted-foreground">{ROL_LABEL[cob.rol] ?? cob.rol}</p>
                    </div>
                    <span className={`text-xs ${colorDiasAtraso(cob.diasMaxAtraso)}`}>
                      {cob.diasMaxAtraso === 1 ? '1 día de atraso' : `${cob.diasMaxAtraso} días de atraso`}
                    </span>
                  </div>
                  <table className="w-full text-xs">
                    <thead className="text-[10px] uppercase text-muted-foreground">
                      <tr>
                        <th className="text-left px-2 py-1">Fecha</th>
                        <th className="text-left px-2 py-1">Tipo</th>
                        <th className="text-left px-2 py-1">#</th>
                        <th className="text-left px-2 py-1">Estado</th>
                        <th className="text-left px-2 py-1">Receptor</th>
                        <th className="text-right px-2 py-1">Efectivo a entregar</th>
                        <th className="text-right px-2 py-1">Transf. validadas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cob.cortes.map((c) => {
                        const em = ESTADO_META[c.estado]
                        const Icon = em.icon
                        return (
                          <tr key={c.corteId} className="border-t border-border/30">
                            <td className="px-2 py-1 whitespace-nowrap">
                              {new Date(c.fecha).toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' })}
                            </td>
                            <td className="px-2 py-1">{c.tipo}</td>
                            <td className="px-2 py-1">#{c.numeroCorte}</td>
                            <td className="px-2 py-1">
                              <Badge className={`text-[10px] ${em.className}`}>
                                <Icon className="h-2.5 w-2.5 mr-1 inline" />
                                {em.label}
                              </Badge>
                              {c.rechazoRazon && (
                                <p className="text-[11px] text-rose-300 mt-0.5 italic">{c.rechazoRazon}</p>
                              )}
                            </td>
                            <td className="px-2 py-1 text-muted-foreground">{c.receptorNombre ?? '—'}</td>
                            <td className="px-2 py-1 text-right tabular-nums font-medium">{formatMoney(c.totalAEntregar)}</td>
                            <td className="px-2 py-1 text-right tabular-nums text-sky-300">
                              {c.totalTransferValidada > 0 ? formatMoney(c.totalTransferValidada) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {/* Desglose extra del día más reciente (informativo).
                      Transferencias no validadas no suman al 'a entregar'
                      — están en limbo hasta que el GZ las verifica. Las
                      comisiones y seguros ya están incluidos en el
                      efectivo del corte; se listan aparte para auditar. */}
                  {(cob.transferPendiente > 0 || cob.comisionApertura > 0 || cob.seguroApertura > 0) && (
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                      {cob.transferPendiente > 0 && (
                        <span className="flex items-center gap-1">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
                          Transf. no validadas:
                          <strong className="text-amber-300 tabular-nums">{formatMoney(cob.transferPendiente)}</strong>
                          <span className="text-muted-foreground/70">({cob.transferPendienteCount})</span>
                        </span>
                      )}
                      {cob.comisionApertura > 0 && (
                        <span className="flex items-center gap-1">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-violet-400" />
                          Comisión apertura:
                          <strong className="text-violet-300 tabular-nums">{formatMoney(cob.comisionApertura)}</strong>
                        </span>
                      )}
                      {cob.seguroApertura > 0 && (
                        <span className="flex items-center gap-1">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-fuchsia-400" />
                          Seguro apertura:
                          <strong className="text-fuchsia-300 tabular-nums">{formatMoney(cob.seguroApertura)}</strong>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
