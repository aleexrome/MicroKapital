'use client'

import { Card } from '@/components/ui/card'
import { Banknote, CreditCard, ArrowRightLeft, Users, Calendar } from 'lucide-react'

type Row = {
  fecha:           string  // YYYY-MM-DD
  efectivo:        number
  tarjeta:         number
  transferencia:   number
  recibidoDeOtros: number
  total:           number
}

interface Props {
  rows: Row[]
  esConcentradora: boolean
}

function money(n: number) {
  return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function dowLabel(ymd: string): string {
  // Reconstruimos el día desde el YMD sin que el browser lo recorra a su TZ.
  const [y, m, d] = ymd.split('-').map(Number)
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12))
  return date.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' })
}

/**
 * Sección "Mi cobranza semanal (sáb → hoy)" para coord/gerente/
 * concentradora. Muestra día por día lo cobrado por efectivo, tarjeta,
 * transferencia y (para concentradoras) lo recibido de otros coord.
 * Al final una fila de total semanal.
 */
export function MiCobranzaSemanalSection({ rows, esConcentradora }: Props) {
  const tot = rows.reduce(
    (acc, r) => ({
      efectivo:        acc.efectivo        + r.efectivo,
      tarjeta:         acc.tarjeta         + r.tarjeta,
      transferencia:   acc.transferencia   + r.transferencia,
      recibidoDeOtros: acc.recibidoDeOtros + r.recibidoDeOtros,
      total:           acc.total           + r.total,
    }),
    { efectivo: 0, tarjeta: 0, transferencia: 0, recibidoDeOtros: 0, total: 0 },
  )

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Mi cobranza semanal (sáb → hoy)
        </h2>
        <span className="text-[11px] text-muted-foreground italic">
          Acumulado del CashRegister propio · se actualiza con cada pago
        </span>
      </div>

      <Card className="p-4 space-y-3">
        {/* Tiles de totales */}
        <div className={`grid grid-cols-2 ${esConcentradora ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-3`}>
          <Tile icon={<Banknote className="h-4 w-4 text-emerald-400" />}     label="Efectivo"      value={tot.efectivo} />
          <Tile icon={<CreditCard className="h-4 w-4 text-sky-400" />}       label="Tarjeta"       value={tot.tarjeta} />
          <Tile icon={<ArrowRightLeft className="h-4 w-4 text-amber-400" />} label="Transferencia" value={tot.transferencia} />
          {esConcentradora && (
            <Tile icon={<Users className="h-4 w-4 text-fuchsia-300" />}        label="Recibido de otros" value={tot.recibidoDeOtros} />
          )}
          <Tile icon={<Calendar className="h-4 w-4 text-primary-300" />}      label="Total semana"  value={tot.total} strong />
        </div>

        {/* Desglose día por día */}
        <div className="rounded-md border border-border/40 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/30 text-muted-foreground">
              <tr>
                <th className="text-left px-2 py-1.5 font-medium">Día</th>
                <th className="text-right px-2 py-1.5 font-medium">Efectivo</th>
                <th className="text-right px-2 py-1.5 font-medium">Tarjeta</th>
                <th className="text-right px-2 py-1.5 font-medium">Transferencia</th>
                {esConcentradora && (
                  <th className="text-right px-2 py-1.5 font-medium">Recibido de otros</th>
                )}
                <th className="text-right px-2 py-1.5 font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {rows.map((r) => (
                <tr key={r.fecha} className="hover:bg-muted/20">
                  <td className="px-2 py-1.5 capitalize">{dowLabel(r.fecha)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-emerald-300">{r.efectivo > 0 ? money(r.efectivo) : '—'}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-sky-300">{r.tarjeta > 0 ? money(r.tarjeta) : '—'}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-amber-300">{r.transferencia > 0 ? money(r.transferencia) : '—'}</td>
                  {esConcentradora && (
                    <td className="px-2 py-1.5 text-right tabular-nums text-fuchsia-300">{r.recibidoDeOtros > 0 ? money(r.recibidoDeOtros) : '—'}</td>
                  )}
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{money(r.total)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-border/70 bg-muted/20">
                <td className="px-2 py-1.5 font-semibold">Total semana</td>
                <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-emerald-300">{money(tot.efectivo)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-sky-300">{money(tot.tarjeta)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-amber-300">{money(tot.transferencia)}</td>
                {esConcentradora && (
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-fuchsia-300">{money(tot.recibidoDeOtros)}</td>
                )}
                <td className="px-2 py-1.5 text-right tabular-nums font-bold">{money(tot.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  )
}

function Tile({ icon, label, value, strong }: { icon: React.ReactNode; label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="shrink-0">{icon}</div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`tabular-nums ${strong ? 'text-base font-bold' : 'text-sm font-semibold'}`}>
          {money(value)}
        </div>
      </div>
    </div>
  )
}
