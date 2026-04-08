import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { formatMoney } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle2, Clock, AlertCircle, Users, CalendarDays, Building2, UserCheck } from 'lucide-react'
import Link from 'next/link'

function today() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}
function tomorrow() {
  const d = today()
  d.setDate(d.getDate() + 1)
  return d
}

export default async function PactadosDiaPage({
  searchParams,
}: {
  searchParams: { branchId?: string }
}) {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  const { rol, companyId, branchId: myBranchId, id: userId } = session.user

  const isDirector = rol === 'DIRECTOR_GENERAL' || rol === 'DIRECTOR_COMERCIAL'
  const isGerente  = rol === 'GERENTE_ZONAL' || rol === 'GERENTE'

  if (!isDirector && !isGerente) redirect('/cobros/agenda')

  // Determine which branches to show
  let allowedBranchIds: string[] | undefined
  if (rol === 'GERENTE' && myBranchId) {
    allowedBranchIds = [myBranchId]
  } else if (rol === 'GERENTE_ZONAL') {
    const z = session.user.zonaBranchIds
    allowedBranchIds = z && z.length > 0 ? z : undefined
  }
  // Directors see all branches (allowedBranchIds = undefined)

  // Branch filter from URL param (only directors can switch)
  const selectedBranch = isDirector ? (searchParams.branchId || null) : (myBranchId || null)

  // Fetch branches for filter dropdown (directors only)
  const branches = isDirector
    ? await prisma.branch.findMany({
        where: { companyId: companyId!, activa: true },
        select: { id: true, nombre: true },
        orderBy: { nombre: 'asc' },
      })
    : []

  // Build the loan scope
  const loanWhere: Record<string, unknown> = {
    estado: 'ACTIVE',
    companyId: companyId!,
  }
  if (selectedBranch) {
    loanWhere.branchId = selectedBranch
  } else if (allowedBranchIds) {
    loanWhere.branchId = { in: allowedBranchIds }
  }

  // Fetch today's scheduled payments
  const schedules = await prisma.paymentSchedule.findMany({
    where: {
      fechaVencimiento: { gte: today(), lt: tomorrow() },
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
          branchId: true,
          branch: { select: { id: true, nombre: true } },
          cobradorId: true,
          cobrador: { select: { id: true, nombre: true } },
          client: { select: { id: true, nombreCompleto: true, telefono: true } },
        },
      },
      payments: {
        where: { fechaHora: { gte: today() } },
        select: {
          id: true,
          monto: true,
          metodoPago: true,
          fechaHora: true,
          cobrador: { select: { nombre: true } },
        },
        take: 1,
      },
    },
    orderBy: [{ loan: { branch: { nombre: 'asc' } } }, { loan: { cobrador: { nombre: 'asc' } } }],
  })

  // Group: branchId → cobradorId → schedules
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

  const totalPactados = schedules.length
  const cobrados = schedules.filter((s) => s.payments.length > 0).length
  const pendientes = totalPactados - cobrados
  const montoCobrado = schedules
    .filter((s) => s.payments.length > 0)
    .reduce((sum, s) => sum + Number(s.payments[0].monto), 0)
  const montoPendiente = schedules
    .filter((s) => s.payments.length === 0)
    .reduce((sum, s) => sum + Number(s.montoEsperado), 0)

  const today_label = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <CalendarDays className="h-5 w-5 text-primary-700" />
          <h1 className="text-2xl font-bold text-gray-900">Pactados del Día</h1>
        </div>
        <p className="text-muted-foreground text-sm capitalize">{today_label}</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total pactados</p>
            <p className="text-2xl font-bold text-gray-900">{totalPactados}</p>
          </CardContent>
        </Card>
        <Card className="border-green-200">
          <CardContent className="p-4">
            <p className="text-xs text-green-600">Cobrados</p>
            <p className="text-2xl font-bold text-green-700">{cobrados}</p>
            <p className="text-xs text-green-600 font-medium">{formatMoney(montoCobrado)}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200">
          <CardContent className="p-4">
            <p className="text-xs text-amber-600">Pendientes</p>
            <p className="text-2xl font-bold text-amber-700">{pendientes}</p>
            <p className="text-xs text-amber-600 font-medium">{formatMoney(montoPendiente)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Avance</p>
            <p className="text-2xl font-bold text-gray-900">
              {totalPactados > 0 ? Math.round((cobrados / totalPactados) * 100) : 0}%
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
            <p>No hay pagos pactados para hoy{selectedBranch ? ' en esta sucursal' : ''}.</p>
          </CardContent>
        </Card>
      )}

      {/* Branch → Cobrador → Clients */}
      {Object.entries(branchMap).map(([bId, branch]) => (
        <div key={bId} className="space-y-3">
          {/* Branch header (only if director seeing multiple branches) */}
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
            const pagados = cobrador.rows.filter((r: ScheduleRow) => r.payments.length > 0)
            const pendientesRows = cobrador.rows.filter((r: ScheduleRow) => r.payments.length === 0)

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
                      <span className="text-amber-600">{pendientesRows.length} pendientes</span>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-1">
                  {cobrador.rows.map((row: ScheduleRow) => {
                    const pago = row.payments[0]
                    const isPaid = !!pago
                    const isOverdue = row.estado === 'OVERDUE'

                    return (
                      <div
                        key={row.id}
                        className={`flex items-center gap-3 py-2 px-3 rounded-lg text-sm ${
                          isPaid ? 'bg-green-50' : isOverdue ? 'bg-red-50' : 'bg-gray-50'
                        }`}
                      >
                        {/* Status icon */}
                        <div className="shrink-0">
                          {isPaid
                            ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                            : isOverdue
                            ? <AlertCircle className="h-4 w-4 text-red-500" />
                            : <Clock className="h-4 w-4 text-amber-500" />}
                        </div>

                        {/* Client info */}
                        <div className="flex-1 min-w-0">
                          <Link
                            href={`/clientes/${row.loan.client.id}`}
                            className="font-medium hover:underline truncate block"
                          >
                            {row.loan.client.nombreCompleto}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {row.loan.tipo} · Pago #{row.numeroPago}
                            {row.loan.client.telefono && ` · ${row.loan.client.telefono}`}
                          </p>
                        </div>

                        {/* Amount */}
                        <div className="text-right shrink-0">
                          <p className={`font-semibold ${isPaid ? 'text-green-700' : 'text-gray-800'}`}>
                            {formatMoney(isPaid ? Number(pago.monto) : Number(row.montoEsperado))}
                          </p>
                          {isPaid ? (
                            <p className="text-[10px] text-green-600">
                              {pago.cobrador.nombre} ·{' '}
                              {new Date(pago.fechaHora).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                              {pago.metodoPago === 'CASH' ? ' · 💵' : pago.metodoPago === 'TRANSFER' ? ' · 🏦' : ' · 💳'}
                            </p>
                          ) : (
                            <p className="text-[10px] text-muted-foreground">Esperado</p>
                          )}
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
