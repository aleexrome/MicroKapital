import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { redirect } from 'next/navigation'
import { formatMoney } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle2, Clock, CalendarDays, Building2, UserCheck, XCircle } from 'lucide-react'
import Link from 'next/link'
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

  const { id: userId, rol, companyId, branchId: myBranchId } = session.user

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

  // ── Branch scope ─────────────────────────────────────────────────────────────
  let allowedBranchIds: string[] | undefined
  if (rol === 'GERENTE' && myBranchId) {
    const branchIds = session.user.zonaBranchIds?.length
      ? session.user.zonaBranchIds
      : [myBranchId]
    allowedBranchIds = branchIds
  } else if (rol === 'GERENTE_ZONAL') {
    const z = session.user.zonaBranchIds
    allowedBranchIds = z && z.length > 0 ? z : undefined
  }

  const selectedBranch = isDirector ? (searchParams.branchId || null) : (myBranchId || null)

  // Fetch branches for filter dropdown (directors only)
  const branches = isDirector
    ? await prisma.branch.findMany({
        where: { companyId: companyId!, activa: true },
        select: { id: true, nombre: true },
        orderBy: { nombre: 'asc' },
      })
    : []

  // ── Loan scope ───────────────────────────────────────────────────────────────
  const loanWhere: Prisma.LoanWhereInput = {
    estado: 'ACTIVE',
    companyId: companyId!,
  }
  if (isCoordinador) {
    loanWhere.cobradorId = userId
  } else if (selectedBranch) {
    loanWhere.branchId = selectedBranch
  } else if (allowedBranchIds) {
    loanWhere.branchId = { in: allowedBranchIds }
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
        },
      },
      // Include ALL payments for this schedule (not just those made on selected date)
      payments: {
        select: {
          id: true,
          monto: true,
          metodoPago: true,
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
  const totalPactados  = schedules.length
  const cobradosRows   = schedules.filter((s) => s.payments.length > 0)
  const pendientesRows = schedules.filter((s) => s.payments.length === 0)
  const montoCobrado   = cobradosRows.reduce((sum, s) => sum + Number(s.payments[0].monto), 0)
  const montoPendiente = pendientesRows.reduce((sum, s) => sum + Number(s.montoEsperado), 0)
  const avance = totalPactados > 0 ? Math.round((cobradosRows.length / totalPactados) * 100) : 0

  // ── Date label ────────────────────────────────────────────────────────────────
  const dateLabel = selectedDate.toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <CalendarDays className="h-5 w-5 text-primary-700" />
            <h1 className="text-2xl font-bold text-gray-900">Pactados del día</h1>
          </div>
          <p className="text-muted-foreground text-sm capitalize">{dateLabel}</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Pactados</p>
            <p className="text-2xl font-bold text-gray-900">{totalPactados}</p>
          </CardContent>
        </Card>
        <Card className="border-green-200">
          <CardContent className="p-4">
            <p className="text-xs text-green-600">Cobrados</p>
            <p className="text-2xl font-bold text-green-700">{cobradosRows.length}</p>
            <p className="text-xs text-green-600 font-medium">{formatMoney(montoCobrado)}</p>
          </CardContent>
        </Card>
        <Card className={pendientesRows.length > 0 ? 'border-amber-200' : ''}>
          <CardContent className="p-4">
            <p className={`text-xs ${pendientesRows.length > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
              {isToday ? 'Pendientes' : 'Sin cobrar'}
            </p>
            <p className={`text-2xl font-bold ${pendientesRows.length > 0 ? 'text-amber-700' : 'text-gray-500'}`}>
              {pendientesRows.length}
            </p>
            {pendientesRows.length > 0 && (
              <p className="text-xs text-amber-600 font-medium">{formatMoney(montoPendiente)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Avance</p>
            <p className={`text-2xl font-bold ${avance === 100 ? 'text-green-700' : avance >= 80 ? 'text-blue-700' : 'text-gray-900'}`}>
              {avance}%
            </p>
          </CardContent>
        </Card>
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
                : 'border-gray-300 hover:border-primary-400 text-gray-700'
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
                  : 'border-gray-300 hover:border-primary-400 text-gray-700'
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
              <Building2 className="h-4 w-4 text-primary-600" />
              <h2 className="font-semibold text-gray-800">{branch.branchNombre}</h2>
              <span className="text-xs text-muted-foreground">
                · {Object.values(branch.cobradores).flatMap((c) => c.rows).length} pactados
              </span>
            </div>
          )}

          {/* Cobrador sections */}
          {Object.entries(branch.cobradores).map(([cId, cobrador]) => {
            const pagados    = cobrador.rows.filter((r: ScheduleRow) => r.payments.length > 0)
            const noPagados  = cobrador.rows.filter((r: ScheduleRow) => r.payments.length === 0)

            return (
              <Card key={cId}>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <UserCheck className="h-4 w-4 text-primary-600" />
                      <span>{cobrador.cobradorNombre}</span>
                      {(isDirector || isGerente) && (
                        <span className="text-xs text-muted-foreground font-normal">
                          ({branch.branchNombre})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs font-normal">
                      <span className="text-green-600">{pagados.length} cobrados</span>
                      <span className="text-muted-foreground">·</span>
                      <span className={noPagados.length > 0 ? 'text-amber-600' : 'text-muted-foreground'}>
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
                        className="flex items-center gap-3 py-2 px-3 rounded-lg text-sm bg-green-50"
                      >
                        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
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
                          <p className="font-semibold text-green-700">{formatMoney(Number(pago.monto))}</p>
                          <p className="text-[10px] text-green-600">
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

                  {/* No cobrados */}
                  {noPagados.map((row: ScheduleRow) => {
                    const isOverdue = row.estado === 'OVERDUE'

                    return (
                      <div
                        key={row.id}
                        className={`flex items-center gap-3 py-2 px-3 rounded-lg text-sm ${
                          !isToday ? 'bg-red-50' : isOverdue ? 'bg-red-50' : 'bg-amber-50'
                        }`}
                      >
                        {!isToday || isOverdue
                          ? <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                          : <Clock className="h-4 w-4 text-amber-500 shrink-0" />
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
                          <p className={`font-semibold ${!isToday ? 'text-red-600' : 'text-amber-700'}`}>
                            {formatMoney(Number(row.montoEsperado))}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {!isToday ? 'No cobrado' : isOverdue ? 'Vencido' : 'Esperado'}
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
    </div>
  )
}
