export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { type Prisma } from '@prisma/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatMoney, formatDate } from '@/lib/utils'
import { DollarSign, Banknote, CreditCard, Users } from 'lucide-react'

// ── helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return formatMoney(n)
}

interface ScheduleRow {
  id: string
  montoPagado: number         // total amount paid on this schedule
  clientNombre: string
  numeroPago: number
  tipo: string
  cobradorId: string
  cobradorNombre: string
  branchNombre: string
  efectivo: number            // from Payment records
  tarjeta: number
  transferenciaVerificada: number
  transferenciaTotal: number
  hasPaymentRecord: boolean   // false = applied by DG, no Payment record
}

interface CobradorGroup {
  id: string
  nombre: string
  branchNombre: string
  cobros: number
  total: number
  efectivo: number
  tarjeta: number
  transferenciaVerificada: number
}

// ─────────────────────────────────────────────────────────────────────────────

export default async function HistorialCobrosPage() {
  const session = await getSession()
  if (!session?.user) return null

  const { companyId, rol, branchId: userBranchId, id: userId } = session.user

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const isDirector    = rol === 'DIRECTOR_GENERAL' || rol === 'DIRECTOR_COMERCIAL' || rol === 'SUPER_ADMIN'
  const isGerente     = rol === 'GERENTE_ZONAL' || rol === 'GERENTE'
  const isCoordinador = rol === 'COORDINADOR' || rol === 'COBRADOR'

  // ── Scope (mismo que dashboard) ───────────────────────────────────────────
  const loanScope: Prisma.LoanWhereInput = { companyId: companyId! }
  if (isDirector && rol !== 'SUPER_ADMIN' && userBranchId) {
    loanScope.branchId = userBranchId
  } else if (rol === 'GERENTE_ZONAL') {
    const zoneIds = session.user.zonaBranchIds
    if (zoneIds?.length) loanScope.branchId = { in: zoneIds }
  } else if (rol === 'GERENTE') {
    const branchIds = session.user.zonaBranchIds?.length
      ? session.user.zonaBranchIds
      : userBranchId ? [userBranchId] : null
    if (branchIds?.length) loanScope.branchId = { in: branchIds }
  } else if (isCoordinador) {
    loanScope.cobradorId = userId
  }

  // ── Consulta principal: PaymentSchedule pagados hoy ──────────────────────
  // Cubre cobros normales (vía POST /api/payments) Y cobros aplicados por DG
  // (que solo actualizan el schedule sin crear registro Payment)
  const schedulesHoy = await prisma.paymentSchedule.findMany({
    where: {
      loan: loanScope,
      estado: { in: ['PAID', 'ADVANCE'] },
      pagadoAt: { gte: today, lt: tomorrow },
    },
    select: {
      id: true,
      montoPagado: true,
      numeroPago: true,
      loan: {
        select: {
          tipo: true,
          cobradorId: true,
          cobrador: { select: { id: true, nombre: true } },
          branch:   { select: { nombre: true } },
          client:   { select: { nombreCompleto: true } },
        },
      },
      // Payment records asociados a este schedule (para saber el método)
      payments: {
        select: {
          monto: true,
          metodoPago: true,
          statusTransferencia: true,
        },
      },
    },
    orderBy: { pagadoAt: 'desc' },
  })

  // ── Normalizar filas ──────────────────────────────────────────────────────
  const rows: ScheduleRow[] = schedulesHoy.map((s) => {
    const efectivo = s.payments
      .filter((p) => p.metodoPago === 'CASH')
      .reduce((sum, p) => sum + Number(p.monto), 0)
    const tarjeta = s.payments
      .filter((p) => p.metodoPago === 'CARD')
      .reduce((sum, p) => sum + Number(p.monto), 0)
    const transferenciaVerificada = s.payments
      .filter((p) => p.metodoPago === 'TRANSFER' && p.statusTransferencia === 'VERIFICADO')
      .reduce((sum, p) => sum + Number(p.monto), 0)
    const transferenciaTotal = s.payments
      .filter((p) => p.metodoPago === 'TRANSFER')
      .reduce((sum, p) => sum + Number(p.monto), 0)

    return {
      id:                      s.id,
      montoPagado:             Number(s.montoPagado),
      clientNombre:            s.loan.client.nombreCompleto,
      numeroPago:              s.numeroPago,
      tipo:                    s.loan.tipo,
      cobradorId:              s.loan.cobradorId,
      cobradorNombre:          s.loan.cobrador.nombre,
      branchNombre:            s.loan.branch.nombre,
      efectivo,
      tarjeta,
      transferenciaVerificada,
      transferenciaTotal,
      hasPaymentRecord:        s.payments.length > 0,
    }
  })

  // ── KPIs globales ─────────────────────────────────────────────────────────
  const totalCobrado = rows.reduce((s, r) => s + r.montoPagado, 0)
  const totalEfectivo = rows.reduce((s, r) => s + r.efectivo, 0)
  const totalTarjeta  = rows.reduce((s, r) => s + r.tarjeta, 0)
  const totalTransVerificada = rows.reduce((s, r) => s + r.transferenciaVerificada, 0)

  // ── Agrupar por cobrador (para directores/gerentes) ───────────────────────
  const byCobradorMap = new Map<string, CobradorGroup>()
  for (const r of rows) {
    if (!byCobradorMap.has(r.cobradorId)) {
      byCobradorMap.set(r.cobradorId, {
        id:                      r.cobradorId,
        nombre:                  r.cobradorNombre,
        branchNombre:            r.branchNombre,
        cobros:                  0,
        total:                   0,
        efectivo:                0,
        tarjeta:                 0,
        transferenciaVerificada: 0,
      })
    }
    const g = byCobradorMap.get(r.cobradorId)!
    g.cobros  += 1
    g.total   += r.montoPagado
    g.efectivo += r.efectivo
    g.tarjeta  += r.tarjeta
    g.transferenciaVerificada += r.transferenciaVerificada
  }
  const byCobraodor = Array.from(byCobradorMap.values())
    .sort((a, b) => b.total - a.total)

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Cobros de hoy</h1>
        <p className="text-muted-foreground">{formatDate(new Date())}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="bg-emerald-500/15 rounded-xl p-2">
              <DollarSign className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total cobrado</p>
              <p className="text-lg font-bold text-emerald-400">{fmt(totalCobrado)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="bg-blue-500/15 rounded-xl p-2">
              <Banknote className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Efectivo</p>
              <p className="text-lg font-bold text-blue-400">{fmt(totalEfectivo)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="bg-violet-500/15 rounded-xl p-2">
              <CreditCard className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tarjeta</p>
              <p className="text-lg font-bold text-violet-400">{fmt(totalTarjeta)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="bg-amber-500/15 rounded-xl p-2">
              <CreditCard className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Transfer. verificadas</p>
              <p className="text-lg font-bold text-amber-400">{fmt(totalTransVerificada)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <DollarSign className="h-10 w-10 mx-auto mb-3 opacity-30" />
            Sin cobros registrados hoy
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Vista directores y gerentes: tabla por coordinador */}
          {(isDirector || isGerente) && byCobraodor.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Por coordinador / asesor
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/60 bg-muted/40">
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Asesor</th>
                        {isDirector && (
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground">Sucursal</th>
                        )}
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground"># Cobros</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground">Total</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground">Efectivo</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground">Tarjeta</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground">Transfer. valid.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {byCobraodor.map((g) => (
                        <tr key={g.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2.5 font-medium">{g.nombre}</td>
                          {isDirector && (
                            <td className="px-4 py-2.5 text-muted-foreground">{g.branchNombre}</td>
                          )}
                          <td className="px-4 py-2.5 text-right">{g.cobros}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-emerald-500">{fmt(g.total)}</td>
                          <td className="px-4 py-2.5 text-right text-blue-400">{g.efectivo > 0 ? fmt(g.efectivo) : '—'}</td>
                          <td className="px-4 py-2.5 text-right text-violet-400">{g.tarjeta > 0 ? fmt(g.tarjeta) : '—'}</td>
                          <td className="px-4 py-2.5 text-right text-amber-400">{g.transferenciaVerificada > 0 ? fmt(g.transferenciaVerificada) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/40 font-bold">
                        <td className="px-4 py-2.5" colSpan={isDirector ? 3 : 2}>Total</td>
                        <td className="px-4 py-2.5 text-right text-emerald-500">{fmt(totalCobrado)}</td>
                        <td className="px-4 py-2.5 text-right text-blue-400">{fmt(totalEfectivo)}</td>
                        <td className="px-4 py-2.5 text-right text-violet-400">{fmt(totalTarjeta)}</td>
                        <td className="px-4 py-2.5 text-right text-amber-400">{fmt(totalTransVerificada)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Detalle de cobros individuales */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Detalle — {rows.length} cobro{rows.length !== 1 ? 's' : ''}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {rows.map((r) => {
                  const metodoPpal =
                    !r.hasPaymentRecord
                      ? '—'
                      : r.efectivo > 0 && r.tarjeta === 0 && r.transferenciaTotal === 0
                      ? '💵 Efectivo'
                      : r.tarjeta > 0 && r.efectivo === 0
                      ? '💳 Tarjeta'
                      : r.transferenciaTotal > 0 && r.efectivo === 0
                      ? `🏦 Transferencia${r.transferenciaVerificada > 0 ? ' ✓' : ' (pendiente)'}`
                      : 'Mixto'

                  return (
                    <div key={r.id} className="flex items-center justify-between px-6 py-3.5">
                      <div>
                        <p className="font-medium text-sm">{r.clientNombre}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.tipo} · Pago {r.numeroPago}
                          {(isDirector || isGerente) && ` · ${r.cobradorNombre}`}
                          {isDirector && ` · ${r.branchNombre}`}
                          {' · '}{metodoPpal}
                        </p>
                      </div>
                      <span className="font-bold text-emerald-500">{fmt(r.montoPagado)}</span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
