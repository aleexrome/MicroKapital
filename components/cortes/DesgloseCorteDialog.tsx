'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Loader2, X, Search } from 'lucide-react'

type Desglose = {
  corteId: string
  tipo: 'PARCIAL' | 'CONSOLIDADO'
  numeroCorte: number
  fecha: string
  estado: string
  totalAEntregar: number
  totalEfectivoCobrado: number
  totalTarjetaCobrado: number
  totalTransferenciaCobrado: number
  totalRecibidoDeOtros: number
  userNombre: string
  branchNombre: string | null
  ventanas: Array<{
    userId: string
    cobradorNombre: string
    desde: string | null
    hasta: string
    parcialNumero?: number
    parcialId?: string
  }>
  pagosCuotas: Array<{
    paymentId: string
    clienteNombre: string
    numeroPago: number | null
    monto: number
    metodoPago: string
    statusTransferencia: string | null
    fechaHora: string
    cobradorNombre: string
  }>
  segurosYComisiones: Array<{
    paymentId: string
    clienteNombre: string
    tipo: 'SEGURO' | 'COMISION'
    monto: number
    metodoPago: string
    fechaHora: string
    cobradorNombre: string
  }>
  moras: Array<{
    moraCobroId: string
    clienteNombre: string
    tipo: string
    monto: number
    cobrada: boolean
    fechaHora: string | null
    cobradorNombre: string
  }>
  transferPendientes: Array<{
    paymentId: string
    clienteNombre: string
    monto: number
    fechaHora: string
    idTransferencia: string | null
    cobradorNombre: string
  }>
  parcialesHijos?: Array<{
    id: string
    numeroCorte: number
    userNombre: string
    totalAEntregar: number
    estado: string
  }>
  totales: {
    pagosCuotasMonto: number
    pagosCuotasCount: number
    segurosMonto: number
    segurosCount: number
    comisionesMonto: number
    comisionesCount: number
    morasMonto: number
    morasCount: number
    transferPendientesMonto: number
    transferPendientesCount: number
  }
}

function money(n: number) {
  return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtHora(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('es-MX', {
    hour:   '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Mexico_City',
  })
}

function fmtFechaHora(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('es-MX', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'America/Mexico_City',
  })
}

interface Props {
  corteId: string | null
  onClose: () => void
}

export function DesgloseCorteDialog({ corteId, onClose }: Props) {
  const [data, setData]       = useState<Desglose | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    if (!corteId) {
      setData(null)
      setError(null)
      return
    }
    let cancel = false
    setLoading(true)
    setError(null)
    fetch(`/api/cortes/${corteId}/desglose`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error ?? `Error ${r.status}`)
        return d as Desglose
      })
      .then((d) => { if (!cancel) setData(d) })
      .catch((e) => { if (!cancel) setError(e instanceof Error ? e.message : 'Error') })
      .finally(() => { if (!cancel) setLoading(false) })
    return () => { cancel = true }
  }, [corteId])

  if (!corteId) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl rounded-2xl bg-card border border-border/60 shadow-xl p-5 space-y-4 my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <Search className="h-4 w-4" />
              Desglose del corte
            </h3>
            {data && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {data.tipo === 'PARCIAL' ? 'Parcial' : 'Consolidado'} #{data.numeroCorte} ·{' '}
                {data.userNombre}
                {data.branchNombre ? ` · ${data.branchNombre}` : ''} · {data.fecha}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando desglose…
          </div>
        )}

        {error && (
          <Card className="p-4 border-red-500/30 bg-red-500/5 text-sm text-red-500">
            {error}
          </Card>
        )}

        {data && !loading && (
          <div className="space-y-4">
            {/* Resumen */}
            <Card className="p-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <Metric label="Pagos de cuotas" monto={data.totales.pagosCuotasMonto} count={data.totales.pagosCuotasCount} />
                <Metric label="Seguros apertura" monto={data.totales.segurosMonto} count={data.totales.segurosCount} />
                <Metric label="Comisiones apertura" monto={data.totales.comisionesMonto} count={data.totales.comisionesCount} />
                <Metric label="Multas/Moras cobradas" monto={data.totales.morasMonto} count={data.totales.morasCount} />
                <Metric label="Efectivo cobrado" monto={data.totalEfectivoCobrado} />
                <Metric label="Tarjeta cobrada" monto={data.totalTarjetaCobrado} />
                <Metric label="Transfer validadas" monto={data.totalTransferenciaCobrado} />
                <Metric label="Total a entregar" monto={data.totalAEntregar} strong />
              </div>
              {data.ventanas.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border/50 text-[11px] text-muted-foreground space-y-0.5">
                  <div className="font-medium">Ventana{data.ventanas.length > 1 ? 's' : ''} auditada{data.ventanas.length > 1 ? 's' : ''}:</div>
                  {data.ventanas.map((v, i) => (
                    <div key={i}>
                      • {v.cobradorNombre}
                      {v.parcialNumero != null ? ` (P#${v.parcialNumero})` : ''}:{' '}
                      {v.desde ? fmtFechaHora(v.desde) : 'inicio del día'} → {fmtFechaHora(v.hasta)}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Parciales hijos si CONSOLIDADO */}
            {data.parcialesHijos && data.parcialesHijos.length > 0 && (
              <Section titulo={`Parciales incluidos (${data.parcialesHijos.length})`}>
                <div className="flex flex-wrap gap-1.5">
                  {data.parcialesHijos.map((h) => (
                    <span
                      key={h.id}
                      className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[11px]"
                      title={h.estado}
                    >
                      P#{h.numeroCorte} · {h.userNombre} · {money(h.totalAEntregar)}
                    </span>
                  ))}
                </div>
              </Section>
            )}

            {/* Pagos de cuotas */}
            <Section titulo={`Pagos de cuotas (${data.totales.pagosCuotasCount}) — ${money(data.totales.pagosCuotasMonto)}`}>
              {data.pagosCuotas.length === 0 ? (
                <Empty>Sin pagos de cuotas en esta ventana.</Empty>
              ) : (
                <Tabla
                  headers={['Hora', 'Cliente', 'Pago #', 'Método', 'Cobrador', 'Monto']}
                  rows={data.pagosCuotas.map((p) => [
                    fmtHora(p.fechaHora),
                    p.clienteNombre,
                    p.numeroPago != null ? `#${p.numeroPago}` : '—',
                    metodoLabel(p.metodoPago, p.statusTransferencia),
                    p.cobradorNombre,
                    money(p.monto),
                  ])}
                />
              )}
            </Section>

            {/* Seguros y comisiones */}
            <Section titulo={`Seguros y comisiones de apertura (${data.totales.segurosCount + data.totales.comisionesCount}) — ${money(data.totales.segurosMonto + data.totales.comisionesMonto)}`}>
              {data.segurosYComisiones.length === 0 ? (
                <Empty>Sin cobros de apertura en esta ventana.</Empty>
              ) : (
                <Tabla
                  headers={['Hora', 'Cliente', 'Tipo', 'Método', 'Cobrador', 'Monto']}
                  rows={data.segurosYComisiones.map((p) => [
                    fmtHora(p.fechaHora),
                    p.clienteNombre,
                    p.tipo === 'SEGURO' ? 'Seguro' : 'Comisión',
                    metodoLabel(p.metodoPago, null),
                    p.cobradorNombre,
                    money(p.monto),
                  ])}
                />
              )}
            </Section>

            {/* Moras */}
            <Section titulo={`Multas y moras cobradas (${data.totales.morasCount}) — ${money(data.totales.morasMonto)}`}>
              {data.moras.length === 0 ? (
                <Empty>Sin multas/moras cobradas en esta ventana.</Empty>
              ) : (
                <Tabla
                  headers={['Hora', 'Cliente', 'Tipo', 'Cobrador', 'Monto']}
                  rows={data.moras.map((m) => [
                    fmtHora(m.fechaHora),
                    m.clienteNombre,
                    m.tipo,
                    m.cobradorNombre,
                    money(m.monto),
                  ])}
                />
              )}
            </Section>

            {/* Transfer pendientes */}
            {data.transferPendientes.length > 0 && (
              <Section titulo={`Transferencias NO verificadas en la ventana (${data.totales.transferPendientesCount}) — ${money(data.totales.transferPendientesMonto)}`}>
                <p className="text-[11px] text-muted-foreground mb-2">
                  Estas transferencias el gerente aún no las valida. No cuentan en el total a entregar hasta que se confirmen.
                </p>
                <Tabla
                  headers={['Hora', 'Cliente', 'Referencia', 'Cobrador', 'Monto']}
                  rows={data.transferPendientes.map((t) => [
                    fmtHora(t.fechaHora),
                    t.clienteNombre,
                    t.idTransferencia ?? '—',
                    t.cobradorNombre,
                    money(t.monto),
                  ])}
                />
              </Section>
            )}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </div>
  )
}

function Metric({ label, monto, count, strong }: { label: string; monto: number; count?: number; strong?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`tabular-nums ${strong ? 'text-sm font-semibold' : 'text-xs'}`}>
        {money(monto)}
        {count != null && <span className="ml-1 text-[10px] text-muted-foreground">({count})</span>}
      </div>
    </div>
  )
}

function Section({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{titulo}</div>
      {children}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <Card className="p-3 text-[11px] text-muted-foreground">{children}</Card>
}

function Tabla({ headers, rows }: { headers: string[]; rows: Array<Array<string | number>> }) {
  return (
    <div className="rounded-md border border-border/60 overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            {headers.map((h, i) => (
              <th key={i} className={`px-2 py-1.5 text-left font-medium whitespace-nowrap ${i === headers.length - 1 ? 'text-right' : ''}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border/40 hover:bg-muted/20">
              {r.map((c, j) => (
                <td key={j} className={`px-2 py-1 whitespace-nowrap ${j === r.length - 1 ? 'text-right tabular-nums' : ''}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function metodoLabel(m: string, status: string | null) {
  switch (m) {
    case 'CASH':     return 'Efectivo'
    case 'CARD':     return 'Tarjeta'
    case 'TRANSFER': return status === 'VERIFICADO' ? 'Transfer ✓' : status === 'PENDIENTE' ? 'Transfer ⏳' : 'Transfer'
    default:         return m
  }
}
