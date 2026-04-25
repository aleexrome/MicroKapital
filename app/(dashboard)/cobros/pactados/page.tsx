import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { scopedLoanWhere } from '@/lib/access'
import { isOverdue } from '@/lib/schedule'
import { Prisma } from '@prisma/client'
import { redirect } from 'next/navigation'
import { formatMoney } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle2, Clock, CalendarDays, Building2, UserCheck, XCircle } from 'lucide-react'
import Link from 'next/link'
import { ImprimirPactadosButton } from '@/components/cobros/ImprimirPactadosButton'
import type { PactadosPrintRow } from '@/components/cobros/ImprimirPactadosButton'
function toYMD(d: Date) {
  return d.toISOString().split('T')[0]
}

export default async function PactadosDiaPage({
  searchParams,
}: {
  searchParams: { branchId?: string }
}) {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  const { rol, companyId, branchId: myBranchId } = session.user

  const isDirector    = rol === 'DIRECTOR_GENERAL' || rol === 'DIRECTOR_COMERCIAL'
  const isGerente     = rol === 'GERENTE_ZONAL' || rol === 'GERENTE'
  const isCoordinador = rol === 'COORDINADOR' || rol === 'COBRADOR'

  // ── Date: always TODAY ───────────────────────────────────────────────────────
  const selectedDate = new Date()
  selectedDate.setHours(0, 0, 0, 0)
  const nextDay = new Date(selectedDate)
  nextDay.setDate(nextDay.getDate() + 1)
  const fechaStr = toYMD(selectedDate)
  const isToday = true

  const selectedBranch = isDirector ? (searchParams.branchId || null) : (myBranchId || null)

  // Fetch branches for filter dropdown (directors only)
  const branches = isDirector
    ? await prisma.branch.findMany({
        where: { companyId: companyId!, activa: true },
        select: { id: true, nombre: true },
        orderBy: { nombre: 'asc' },
      })
    : []

  // Alcance por rol/sucursal — fail-closed si falta sucursal. Además, si el
  // Director filtró por una sucursal específica, restringimos a ella.
  const loanWhere: Prisma.LoanWhereInput = {
    estado: 'ACTIVE',
    companyId: companyId!,
    AND: [scopedLoanWhere(session.user)],
    ...(isDirector && selectedBranch ? { branchId: selectedBranch } : {}),
  }

  // ── Fetch schedules due on the selected date ──────────────────────────────────
  const schedules = await prisma.paymentSchedule.findMany({
    where: {
      fechaVencimiento: { gte: selectedDate, lt: nextDay },
      loan: loanWhere,
    },
    select: {
      id: true,
      numeroPago: true,
      montoEsperado: true,
      estado: true,
      fechaVencimiento: true,
      loan: {
        select: {
          id: true,
          tipo: true,
          plazo: true,
          branchId: true,
          branch: { select: { id: true, nombre: true } },
          cobradorId: true,
          cobrador: { select: { id: true, nombre: true } },
          client: { select: { id: true, nombreCompleto: true, telefono: true } },
          loanGroup: { select: { id: true, nombre: true } },
          diaPago: true,
        },
      },
      // Include ALL payments for this schedule (not just those made on selected date)
      payments: {
        select: {
          id: true,
          monto: true,
          metodoPago: true,
          statusTransferencia: true,
          fechaHora: true,
          cobrador: { select: { nombre: true } },
        },
        orderBy: { fechaHora: 'asc' },
        take: 1,
      },
    },
    orderBy: [{ loan: { branch: { nombre: 'asc' } } }, { loan: { cobrador: { nombre: 'asc' } } }],
  })

  // ── Group: branchId → cobradorId → schedules ─────────────────────────────────
  type ScheduleRow = (typeof schedules)[number]

  const branchMap: Record<string, {
    branchNombre: string
    cobradores: Record<string, { cobradorNombre: string; rows: ScheduleRow[] }>
  }> = {}

  for (const s of schedules) {
    const bId = s.loan.branchId
    const cId = s.loan.cobradorId
    if (!branchMap[bId]) {
      branchMap[bId] = { branchNombre: s.loan.branch.nombre, cobradores: {} }
    }
    if (!branchMap[bId].cobradores[cId]) {
      branchMap[bId].cobradores[cId] = { cobradorNombre: s.loan.cobrador.nombre, rows: [] }
    }
    branchMap[bId].cobradores[cId].rows.push(s)
  }

  // ── Totals ───────────────────────────────────────────────────────────────────
  // Una transferencia PENDIENTE no cuenta como cobrado — queda "en validación"
  type PaymentRow = ScheduleRow['payments'][number]
  const isPendingTransfer = (p: PaymentRow) =>
    p.metodoPago === 'TRANSFER' && p.statusTransferencia === 'PENDIENTE'

  const totalPactados      = schedules.length
  const cobradosRows       = schedules.filter((s) => s.payments.length > 0 && !isPendingTransfer(s.payments[0]))
  const enValidacionRows   = schedules.filter((s) => s.payments.length > 0 && isPendingTransfer(s.payments[0]))
  const pendientesRows     = schedules.filter((s) => s.payments.length === 0)
  const montoCobrado       = cobradosRows.reduce((sum, s) => sum + Number(s.payments[0].monto), 0)
  const montoEnValidacion  = enValidacionRows.reduce((sum, s) => sum + Number(s.payments[0].monto), 0)
  const montoPendiente     = pendientesRows.reduce((sum, s) => sum + Number(s.montoEsperado), 0)
  const avance = totalPactados > 0 ? Math.round((cobradosRows.length / totalPactados) * 100) : 0

  // ── Date label ────────────────────────────────────────────────────────────────
  const dateLabel = selectedDate.toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  // ── Print rows ────────────────────────────────────────────────────────────────
  const printRows: PactadosPrintRow[] = schedules.map((s) => ({
    clientNombre:  s.loan.client.nombreCompleto,
    numeroPago:    s.numeroPago,
    totalPagos:    s.loan.plazo,
    montoEsperado: Number(s.montoEsperado),
    diaPago:       s.loan.diaPago ?? null,
    tipo:          s.loan.tipo,
    cobradorNombre: s.loan.cobrador.nombre,
    branchNombre:   s.loan.branch.nombre,
    cobrado:        s.payments.length > 0 && !isPendingTransfer(s.payments[0]),
    montoCobrado:   s.payments.length > 0 && !isPendingTransfer(s.payments[0]) ? Number(s.payments[0].monto) : null,
  }))

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <CalendarDays className="h-5 w-5 text-primary-400" />
            <h1 className="text-2xl font-bold">Pactados del día</h1>
          </div>
          <p className="text-muted-foreground text-sm capitalize">{dateLabel}</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg p-4 border border-border bg-muted/30">
          <p className="text-xs text-muted-foreground">Pactados</p>
          <p className="text-2xl font-bold">{totalPactados}</p>
        </div>
        <div className="rounded-lg p-4 border border-emerald-500/20 bg-emerald-500/10">
          <p className="text-xs text-emerald-400">Cobrados</p>
          <p className="text-2xl font-bold text-emerald-300">{cobradosRows.length}</p>
          <p className="text-xs text-emerald-400/80 font-medium">{formatMoney(montoCobrado)}</p>
          {enValidacionRows.length > 0 && (
            <p className="text-[10px] text-yellow-400/90 font-medium mt-1">
              + {enValidacionRows.length} en validación ({formatMoney(montoEnValidacion)})
            </p>
          )}
        </div>
        <div className={`rounded-lg p-4 border ${pendientesRows.length > 0 ? 'border-amber-500/20 bg-amber-500/10' : 'border-border bg-muted/30'}`}>
          <p className={`text-xs ${pendientesRows.length > 0 ? 'text-amber-400' : 'text-muted-foreground'}`}>
            {isToday ? 'Pendientes' : 'Sin cobrar'}
          </p>
          <p className={`text-2xl font-bold ${pendientesRows.length > 0 ? 'text-amber-300' : 'text-muted-foreground'}`}>
            {pendientesRows.length}
          </p>
          {pendientesRows.length > 0 && (
            <p className="text-xs text-amber-400/80 font-medium">{formatMoney(montoPendiente)}</p>
          )}
        </div>
        <div className="rounded-lg p-4 border border-border bg-muted/30">
          <p className="text-xs text-muted-foreground">Avance</p>
          <p className={`text-2xl font-bold ${avance === 100 ? 'text-emerald-300' : avance >= 80 ? 'text-blue-300' : ''}`}>
            {avance}%
          </p>
        </div>
      </div>

      {/* Branch filter (directors only) */}
      {isDirector && branches.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-muted-foreground">Sucursal:</span>
          <Link
            href="/cobros/pactados"
            className={`px-3 py-1 rounded-full text-sm border transition-colors ${
              !selectedBranch
                ? 'bg-primary-700 text-white border-primary-700'
                : 'border-border hover:border-primary-400 text-muted-foreground hover:text-foreground'
            }`}
          >
            Todas
          </Link>
          {branches.map((b) => (
            <Link
              key={b.id}
              href={`/cobros/pactados?branchId=${b.id}`}
              className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                selectedBranch === b.id
                  ? 'bg-primary-700 text-white border-primary-700'
                  : 'border-border hover:border-primary-400 text-muted-foreground hover:text-foreground'
              }`}
            >
              {b.nombre}
            </Link>
          ))}
        </div>
      )}

      {/* Empty state */}
      {Object.keys(branchMap).length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No hay pagos programados para este día{selectedBranch ? ' en esta sucursal' : ''}.</p>
          </CardContent>
        </Card>
      )}

      {/* Branch → Cobrador → Clients */}
      {Object.entries(branchMap).map(([bId, branch]) => (
        <div key={bId} className="space-y-3">
          {/* Branch header */}
          {(isDirector && !selectedBranch) && (
            <div className="flex items-center gap-2 pt-2">
              <Building2 className="h-4 w-4 text-primary-400" />
              <h2 className="font-semibold">{branch.branchNombre}</h2>
              <span className="text-xs text-muted-foreground">
                · {Object.values(branch.cobradores).flatMap((c) => c.rows).length} pactados
              </span>
            </div>
          )}

          {/* Cobrador sections */}
          {Object.entries(branch.cobradores).map(([cId, cobrador]) => {
            const pagados     = cobrador.rows.filter((r: ScheduleRow) => r.payments.length > 0 && !isPendingTransfer(r.payments[0]))
            const enValidacion = cobrador.rows.filter((r: ScheduleRow) => r.payments.length > 0 && isPendingTransfer(r.payments[0]))
            const noPagados   = cobrador.rows.filter((r: ScheduleRow) => r.payments.length === 0)

            return (
              <Card key={cId}>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <UserCheck className="h-4 w-4 text-primary-400" />
                      <span>{cobrador.cobradorNombre}</span>
                      {(isDirector || isGerente) && (
                        <span className="text-xs text-muted-foreground font-normal">
                          ({branch.branchNombre})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs font-normal">
                      <span className="text-emerald-400">{pagados.length} cobrados</span>
                      {enValidacion.length > 0 && (
                        <>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-yellow-400">{enValidacion.length} en validación</span>
                        </>
                      )}
                      <span className="text-muted-foreground">·</span>
                      <span className={noPagados.length > 0 ? 'text-amber-400' : 'text-muted-foreground'}>
                        {noPagados.length} {isToday ? 'pendientes' : 'sin cobrar'}
                      </span>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-1">
                  {/* Cobrados first */}
                  {pagados.map((row: ScheduleRow) => {
                    const pago = row.payments[0]
                    const pagoDate = new Date(pago.fechaHora)
                    const pagoFechaStr = toYMD(pagoDate)
                    const cobroTardio = pagoFechaStr !== fechaStr

                    return (
                      <div
                        key={row.id}
                        className="flex items-center gap-3 py-2 px-3 rounded-lg text-sm bg-emerald-500/10 border border-emerald-500/15"
                      >
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <Link
                            href={`/clientes/${row.loan.client.id}`}
                            className="font-medium hover:underline truncate block"
                          >
                            {row.loan.client.nombreCompleto}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {row.loan.tipo} · Pago #{row.numeroPago} de {row.loan.plazo}
                            {row.loan.client.telefono && ` · ${row.loan.client.telefono}`}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-semibold text-emerald-300">{formatMoney(Number(pago.monto))}</p>
                          <p className="text-[10px] text-emerald-400/70">
                            {pago.cobrador.nombre} ·{' '}
                            {cobroTardio
                              ? pagoDate.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
                              : pagoDate.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                            {cobroTardio && ' (tarde)'}
                            {pago.metodoPago === 'CASH' ? ' · 💵' : pago.metodoPago === 'TRANSFER' ? ' · 🏦' : ' · 💳'}
                          </p>
                        </div>
                      </div>
                    )
                  })}

                  {/* En validación (transferencias pendientes de verificar) */}
                  {enValidacion.map((row: ScheduleRow) => {
                    const pago = row.payments[0]
                    return (
                      <div
                        key={row.id}
                        className="flex items-center gap-3 py-2 px-3 rounded-lg text-sm bg-yellow-500/10 border border-yellow-500/20"
                      >
                        <Clock className="h-4 w-4 text-yellow-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <Link
                            href={`/clientes/${row.loan.client.id}`}
                            className="font-medium hover:underline truncate block"
                          >
                            {row.loan.client.nombreCompleto}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {row.loan.tipo} · Pago #{row.numeroPago} de {row.loan.plazo}
                            {row.loan.client.telefono && ` · ${row.loan.client.telefono}`}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-semibold text-yellow-300">{formatMoney(Number(pago.monto))}</p>
                          <p className="text-[10px] text-yellow-400/80">En validación · 🏦</p>
                        </div>
                      </div>
                    )
                  })}

                  {/* No cobrados */}
                  {noPagados.map((row: ScheduleRow) => {
                    // En Pactados (HOY) un pago no es mora todavía — su vencimiento es hoy.
                    // El helper isOverdue solo devuelve true si vencimiento < hoy 00:00.
                    const vencido = isOverdue(row)

                    return (
                      <div
                        key={row.id}
                        className={`flex items-center gap-3 py-2 px-3 rounded-lg text-sm border ${
                          !isToday || vencido
                            ? 'bg-red-500/10 border-red-500/15'
                            : 'bg-amber-500/10 border-amber-500/15'
                        }`}
                      >
                        {!isToday || vencido
                          ? <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                          : <Clock className="h-4 w-4 text-amber-400 shrink-0" />
                        }
                        <div className="flex-1 min-w-0">
                          <Link
                            href={`/clientes/${row.loan.client.id}`}
                            className="font-medium hover:underline truncate block"
                          >
                            {row.loan.client.nombreCompleto}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {row.loan.tipo} · Pago #{row.numeroPago} de {row.loan.plazo}
                            {row.loan.client.telefono && ` · ${row.loan.client.telefono}`}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`font-semibold ${!isToday || vencido ? 'text-red-300' : 'text-amber-300'}`}>
                            {formatMoney(Number(row.montoEsperado))}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {!isToday ? 'No cobrado' : vencido ? 'Vencido' : 'Esperado'}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            )
          })}
        </div>
      ))}

      {/* Botón imprimir — parte inferior centrada */}
      {printRows.length > 0 && (
        <div className="flex justify-center pt-2">
          <ImprimirPactadosButton
            rows={printRows}
            fechaLabel={dateLabel}
            branchNombre={
              selectedBranch
                ? (branches.find((b) => b.id === selectedBranch)?.nombre ?? 'Sucursal')
                : isCoordinador
                  ? (schedules[0]?.loan.branch.nombre ?? 'Sucursal')
                  : 'Todas'
            }
            cobradorNombre={isCoordinador ? (schedules[0]?.loan.cobrador.nombre ?? 'Cobrador') : 'Todos'}
          />
        </div>
      )}
    </div>
  )
}
