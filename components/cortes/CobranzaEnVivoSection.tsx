'use client'

import { Card } from '@/components/ui/card'
import { Building2, Banknote, CreditCard, ArrowRightLeft } from 'lucide-react'

type Row = {
  cobradorId:     string
  cobradorNombre: string
  cobradorRol:    string
  branchId:       string
  branchNombre:   string
  efectivo:       number
  tarjeta:        number
  transferencia:  number
  total:          number
}

interface Props {
  rows: Row[]
}

function money(n: number) {
  return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

/**
 * Tabla "Cobranza en tiempo real" para DG/DC/SA/MC en /corte-del-dia.
 * Agrupa el snapshot del CashRegister del día por sucursal y lista
 * cada cobrador con su efectivo, tarjeta, transferencia y total. Es
 * SOLO lo cobrado AL MOMENTO — no espera a que entreguen parcial.
 */
export function CobranzaEnVivoSection({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Sin cobros registrados hoy.
      </Card>
    )
  }

  // Agrupar por sucursal
  const porSucursal = new Map<string, { branchNombre: string; items: Row[] }>()
  for (const r of rows) {
    const b = porSucursal.get(r.branchId) ?? { branchNombre: r.branchNombre, items: [] }
    b.items.push(r)
    porSucursal.set(r.branchId, b)
  }

  const totalEmpresa = rows.reduce((s, r) => s + r.total, 0)
  const totalEfectivoEmpresa = rows.reduce((s, r) => s + r.efectivo, 0)
  const totalTarjetaEmpresa = rows.reduce((s, r) => s + r.tarjeta, 0)
  const totalTransfEmpresa = rows.reduce((s, r) => s + r.transferencia, 0)

  return (
    <div className="space-y-3">
      {/* Resumen empresa */}
      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile icon={<Banknote className="h-4 w-4 text-emerald-400" />}       label="Efectivo"      value={totalEfectivoEmpresa} />
          <StatTile icon={<CreditCard className="h-4 w-4 text-sky-400" />}          label="Tarjeta"       value={totalTarjetaEmpresa} />
          <StatTile icon={<ArrowRightLeft className="h-4 w-4 text-amber-400" />}   label="Transferencia" value={totalTransfEmpresa} />
          <StatTile icon={<Building2 className="h-4 w-4 text-fuchsia-300" />}      label="Total empresa" value={totalEmpresa} strong />
        </div>
      </Card>

      {/* Detalle por sucursal */}
      {Array.from(porSucursal.values())
        .sort((a, b) => a.branchNombre.localeCompare(b.branchNombre))
        .map((b) => {
          const subtotal = b.items.reduce((s, r) => s + r.total, 0)
          const items = b.items.sort((a, b2) => b2.total - a.total)
          return (
            <Card key={b.branchNombre} className="p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold">{b.branchNombre}</span>
                  <span className="text-[11px] text-muted-foreground">
                    ({b.items.length} cobrador{b.items.length === 1 ? '' : 'es'})
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Subtotal</div>
                  <div className="text-base font-bold tabular-nums text-fuchsia-200">{money(subtotal)}</div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground">
                      <th className="py-1 pr-3 font-medium">Cobrador</th>
                      <th className="py-1 pr-3 text-right font-medium">Efectivo</th>
                      <th className="py-1 pr-3 text-right font-medium">Tarjeta</th>
                      <th className="py-1 pr-3 text-right font-medium">Transferencia</th>
                      <th className="py-1 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {items.map((r) => (
                      <tr key={r.cobradorId} className="hover:bg-muted/20">
                        <td className="py-1.5 pr-3">
                          <div className="font-medium">{r.cobradorNombre}</div>
                          <div className="text-[10px] text-muted-foreground">{r.cobradorRol}</div>
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-emerald-300">
                          {r.efectivo > 0 ? money(r.efectivo) : '—'}
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-sky-300">
                          {r.tarjeta > 0 ? money(r.tarjeta) : '—'}
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-amber-300">
                          {r.transferencia > 0 ? money(r.transferencia) : '—'}
                        </td>
                        <td className="py-1.5 text-right font-semibold tabular-nums">
                          {money(r.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )
        })}
    </div>
  )
}

function StatTile({ icon, label, value, strong }: { icon: React.ReactNode; label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="shrink-0">{icon}</div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`tabular-nums ${strong ? 'text-base font-bold' : 'text-sm font-semibold'}`}>
          ${value.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </div>
      </div>
    </div>
  )
}
