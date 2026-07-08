import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { redirect, notFound } from 'next/navigation'
import { formatMoney, formatDate } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, AlertTriangle, ShieldCheck, Percent } from 'lucide-react'
import Link from 'next/link'
import { Prisma } from '@prisma/client'
import { todayMx } from '@/lib/timezone'
import { semanasRecientesSatFri, getFriday, formatWeekLabelSatFri, getSaturday } from '@/lib/week-utils'

type TipoDetalle = 'pagos_vencidos' | 'seguros_mes' | 'comisiones_mes'

const TIPO_CONFIG: Record<TipoDetalle, { title: string; icon: React.ComponentType<{ className?: string }> }> = {
  pagos_vencidos: { title: 'Pagos vencidos', icon: AlertTriangle },
  seguros_mes: { title: 'Seguros cobrados', icon: ShieldCheck },
  comisiones_mes: { title: 'Comisiones de apertura', icon: Percent },
}

const DIAS_ES_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export default async function DashboardDetallePage({
  searchParams,
}: {
  searchParams: { tipo?: string; semana?: string; dia?: string }
}) {
  const session = await getSession()
  if (!session?.user || session.user.rol === 'COBRADOR') redirect('/cobros/agenda')

  const { rol, companyId, branchId: userBranchId, id: userId } = session.user
  const tipo = (searchParams.tipo ?? '') as TipoDetalle

  if (!TIPO_CONFIG[tipo]) notFound()

  const { title, icon: Icon } = TIPO_CONFIG[tipo]

  // ── Loan scope por rol ──────────────────────────────────────────────────
  const loanScope: Prisma.LoanWhereInput = { companyId: companyId! }
  if (rol === 'GERENTE_ZONAL') {
    const zoneIds = session.user.zonaBranchIds
    if (zoneIds?.length) loanScope.branchId = { in: zoneIds }
  } else if (rol === 'GERENTE') {
    const branchIds = session.user.zonaBranchIds?.length
      ? session.user.zonaBranchIds
      : userBranchId ? [userBranchId] : null
    if (branchIds?.length) loanScope.branchId = { in: branchIds }
  } else if (rol === 'COORDINADOR') {
    loanScope.cobradorId = userId
  }

  const today = todayMx()
  const firstOfMonth = new Date(today)
  firstOfMonth.setUTCDate(1)

  // ── Pagos vencidos — sin filtros de fecha (siempre lo actual) ───────────
  if (tipo === 'pagos_vencidos') {
    const schedules = await prisma.paymentSchedule.findMany({
      where: {
        loan: { ...loanScope, estado: 'ACTIVE' },
        estado: { in: ['PENDING', 'PARTIAL'] },
        fechaVencimiento: { lt: today },
      },
      orderBy: { fechaVencimiento: 'asc' },
      take: 200,
      include: {
        loan: {
          include: {
            client: { select: { id: true, nombreCompleto: true } },
            cobrador: { select: { nombre: true } },
          },
        },
      },
    })

    const totalAdeudado = schedules.reduce(
      (s, sc) => s + Math.max(0, Number(sc.montoEsperado) - Number(sc.montoPagado)),
      0,
    )

    return (
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/dashboard"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Icon className="h-6 w-6 text-rose-400" />
              {title}
            </h1>
            <p className="text-muted-foreground text-sm">{schedules.length} pagos vencidos · Total adeudado: <span className="font-semibold text-rose-400">{formatMoney(totalAdeudado)}</span></p>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {schedules.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">No hay pagos vencidos</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/40">
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Cliente</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Cobrador</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">Pago #</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">Vencía</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {schedules.map((sc) => {
                      const diasVencido = Math.floor((Date.now() - new Date(sc.fechaVencimiento).getTime()) / 86400000)
                      return (
                        <tr key={sc.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2.5">
                            <Link href={`/clientes/${sc.loan.client.id}`} className="font-medium hover:underline text-primary">
                              {sc.loan.client.nombreCompleto}
                            </Link>
                            <p className="text-xs text-muted-foreground">{sc.loan.tipo}</p>
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground">{sc.loan.cobrador.nombre}</td>
                          <td className="px-4 py-2.5 text-right">{sc.numeroPago}</td>
                          <td className="px-4 py-2.5 text-right">
                            <span className="text-rose-400 font-medium">{formatDate(sc.fechaVencimiento)}</span>
                            <p className="text-xs text-muted-foreground">{diasVencido}d atrás</p>
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold">{formatMoney(Number(sc.montoPagado))}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── seguros_mes / comisiones_mes — con filtro opcional día/semana ───────
  //
  // Prioridad de filtros:
  //   ?dia=YYYY-MM-DD    → SOLO ese día
  //   ?semana=YYYY-MM-DD → semana Sáb–Vie de ese sábado
  //   (nada)             → mes actual (default histórico)
  //
  // Los dos son opcionales y mutuamente excluyentes. `dia` gana si vienen
  // los dos. Se valida el formato — si viene basura se ignora.
  const rangoSemanas = semanasRecientesSatFri(6) // últimas 6 semanas para elegir
  const validoISO = /^\d{4}-\d{2}-\d{2}$/
  const semanaParam = searchParams.semana && validoISO.test(searchParams.semana)
    ? searchParams.semana
    : null
  const diaParam = searchParams.dia && validoISO.test(searchParams.dia)
    ? searchParams.dia
    : null

  const toDayKey = (d: Date) => d.toISOString().slice(0, 10)

  let rangoInicio: Date
  let rangoFin: Date
  let rangoLabel: string

  if (diaParam) {
    rangoInicio = new Date(`${diaParam}T00:00:00.000Z`)
    rangoFin = new Date(`${diaParam}T23:59:59.999Z`)
    const d = new Date(rangoInicio)
    rangoLabel = `${DIAS_ES_CORTOS[d.getUTCDay()]} ${d.getUTCDate().toString().padStart(2, '0')}/${(d.getUTCMonth() + 1).toString().padStart(2, '0')}`
  } else if (semanaParam) {
    rangoInicio = new Date(`${semanaParam}T00:00:00.000Z`)
    const friday = getFriday(rangoInicio)
    rangoFin = new Date(friday)
    rangoFin.setUTCHours(23, 59, 59, 999)
    rangoLabel = formatWeekLabelSatFri(rangoInicio)
  } else {
    rangoInicio = firstOfMonth
    rangoFin = new Date(today)
    rangoFin.setUTCHours(23, 59, 59, 999)
    rangoLabel = 'Este mes'
  }

  // Días de la semana seleccionada — para pintar chips de días. Si no hay
  // ?semana pero sí ?dia, calculamos el sábado del día para pintar la
  // fila de días de esa semana con el activo. Si no hay ni uno ni otro,
  // usamos la semana en curso.
  const semanaDelDia = diaParam
    ? getSaturday(new Date(`${diaParam}T00:00:00.000Z`))
    : semanaParam
      ? new Date(`${semanaParam}T00:00:00.000Z`)
      : getSaturday(new Date())
  const diasDeLaSemana = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(semanaDelDia)
    d.setUTCDate(d.getUTCDate() + i)
    return d
  })

  // Datos
  const { rows, total } = await getRowsSegurosComisiones(prisma, {
    tipo,
    loanScope,
    rangoInicio,
    rangoFin,
  })

  const buildHref = (opts: { semana?: string | null; dia?: string | null }) => {
    const p = new URLSearchParams()
    p.set('tipo', tipo)
    if (opts.dia) p.set('dia', opts.dia)
    else if (opts.semana) p.set('semana', opts.semana)
    return `/dashboard/detalle?${p.toString()}`
  }

  const iconColor = tipo === 'seguros_mes' ? 'text-indigo-400' : 'text-orange-400'
  const totalColor = tipo === 'seguros_mes' ? 'text-indigo-400' : 'text-orange-400'
  const emptyMsg = tipo === 'seguros_mes' ? 'No hay seguros cobrados' : 'No hay comisiones cobradas'

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/dashboard"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Icon className={`h-6 w-6 ${iconColor}`} />
            {title}
          </h1>
          <p className="text-muted-foreground text-sm">
            {rows.length} créditos · {rangoLabel} · Total: <span className={`font-semibold ${totalColor}`}>{formatMoney(total)}</span>
          </p>
        </div>
      </div>

      {/* Filtros por semana Sáb–Vie */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground mr-1">Filtrar por semana:</span>
        <Link
          href={buildHref({})}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            !semanaParam && !diaParam
              ? 'bg-orange-500 text-white border border-orange-500 shadow-sm'
              : 'bg-transparent text-orange-600 border border-orange-500 hover:bg-orange-500/10'
          }`}
        >
          Todo el mes
        </Link>
        {rangoSemanas.map((sat) => {
          const key = toDayKey(sat)
          const isActive = semanaParam === key && !diaParam
          return (
            <Link
              key={key}
              href={buildHref({ semana: key })}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-orange-500 text-white border border-orange-500 shadow-sm'
                  : 'bg-transparent text-orange-600 border border-orange-500 hover:bg-orange-500/10'
              }`}
            >
              {formatWeekLabelSatFri(sat)}
            </Link>
          )
        })}
      </div>

      {/* Filtros por día — los 7 días de la semana en contexto */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground mr-1">Filtrar por día:</span>
        <Link
          href={buildHref({ semana: semanaParam })}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            !diaParam
              ? 'bg-orange-500 text-white border border-orange-500 shadow-sm'
              : 'bg-transparent text-orange-600 border border-orange-500 hover:bg-orange-500/10'
          }`}
        >
          Todos
        </Link>
        {diasDeLaSemana.map((d) => {
          const key = toDayKey(d)
          const isActive = diaParam === key
          return (
            <Link
              key={key}
              href={buildHref({ dia: key })}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-orange-500 text-white border border-orange-500 shadow-sm'
                  : 'bg-transparent text-orange-600 border border-orange-500 hover:bg-orange-500/10'
              }`}
            >
              {DIAS_ES_CORTOS[d.getUTCDay()]} {String(d.getUTCDate()).padStart(2, '0')}
            </Link>
          )
        })}
      </div>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">{emptyMsg}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/40">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Cliente</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Sucursal</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Cobrador</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Desembolso</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Capital</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">
                      {tipo === 'seguros_mes' ? 'Seguro' : 'Comisión'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((loan) => (
                    <tr key={loan.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5">
                        <Link href={`/clientes/${loan.client.id}`} className="font-medium hover:underline text-primary">
                          {loan.client.nombreCompleto}
                        </Link>
                        <p className="text-xs text-muted-foreground">{loan.tipo}</p>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{loan.branch?.nombre ?? '—'}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{loan.cobrador.nombre}</td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">
                        {loan.fechaDesembolso ? formatDate(loan.fechaDesembolso) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right">{formatMoney(Number(loan.capital))}</td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${totalColor}`}>
                        {formatMoney(Number(tipo === 'seguros_mes' ? loan.seguro ?? 0 : loan.comision ?? 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

async function getRowsSegurosComisiones(
  prisma: import('@prisma/client').PrismaClient,
  opts: {
    tipo: 'seguros_mes' | 'comisiones_mes'
    loanScope: Prisma.LoanWhereInput
    rangoInicio: Date
    rangoFin: Date
  },
) {
  const { tipo, loanScope, rangoInicio, rangoFin } = opts
  const campoFilter: Prisma.LoanWhereInput = tipo === 'seguros_mes'
    ? { seguro: { gt: 0 } }
    : { comision: { gt: 0 } }

  const rows = await prisma.loan.findMany({
    where: {
      ...loanScope,
      estado: 'ACTIVE',
      fechaDesembolso: { gte: rangoInicio, lte: rangoFin },
      ...campoFilter,
    },
    orderBy: { fechaDesembolso: 'desc' },
    take: 200,
    include: {
      client: { select: { id: true, nombreCompleto: true } },
      cobrador: { select: { nombre: true } },
      branch: { select: { nombre: true } },
    },
  })

  const total = rows.reduce(
    (s, l) => s + Number(tipo === 'seguros_mes' ? l.seguro ?? 0 : l.comision ?? 0),
    0,
  )
  return { rows, total }
}
