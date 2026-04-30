import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { scopedLoanWhere, loanNotDeletedWhere } from '@/lib/access'
import { Prisma } from '@prisma/client'
import Link from 'next/link'
import { formatMoney, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar, ChevronRight, Users, CheckCircle2, XCircle, UserCheck, Building2, Clock } from 'lucide-react'
import { esDiaHabil } from '@/lib/business-days'
import { isOverdue } from '@/lib/schedule'
import { AgendaDatePicker } from '@/components/cobros/AgendaDatePicker'
import { ImprimirAgendaButton } from '@/components/cobros/ImprimirAgendaButton'
import { todayMx, parseMxYMD, toMxYMD } from '@/lib/timezone'

function nowMx() {
  return todayMx()
}

function parseDate(dateStr?: string): Date {
  const today = todayMx()
  // Ayer en CDMX
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)

  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return yesterday
  }
  const date = parseMxYMD(dateStr)
  return date < today ? date : yesterday
}

function toYMD(d: Date) {
  return toMxYMD(d)
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: { fecha?: string; fechaFin?: string }
}) {
  const session = await getSession()
  if (!session?.user) return null

  const { rol, companyId } = session.user

  const isDirector = rol === 'DIRECTOR_GENERAL' || rol === 'DIRECTOR_COMERCIAL'
  const isGerente  = rol === 'GERENTE_ZONAL' || rol === 'GERENTE'

  const selectedDate = parseDate(searchParams.fecha)
  const fechaStr = toYMD(selectedDate)

  // Rango de fechas: si hay fechaFin, usar rango; si no, un solo día
  const hasFechaFin = searchParams.fechaFin && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.fechaFin)
  let endDate: Date
  if (hasFechaFin) {
    endDate = new Date(searchParams.fechaFin + 'T00:00:00')
    endDate.setDate(endDate.getDate() + 1)
  } else {
    endDate = new Date(selectedDate)
    endDate.setDate(endDate.getDate() + 1)
  }
  const isToday = fechaStr === toYMD(new Date())   // siempre false (Cobranza bloquea hoy)

  // Yesterday string — used as maxDate for the date picker
  const now = nowMx()
  const yesterdayStr = toYMD(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))

  // ── Alcance unificado por rol/sucursal (vía scopedLoanWhere) ────────────────
  // Mismo criterio que /cobros/pactados y /cartera para evitar inconsistencias.
  // Los directores ven toda la empresa; gerente/zonal por sucursal/zona;
  // coordinador/cobrador solo lo suyo.
  const loanWhere: Prisma.LoanWhereInput = {
    estado: 'ACTIVE',
    companyId: companyId!,
    AND: [scopedLoanWhere(session.user), loanNotDeletedWhere],
  }

  const schedule = await prisma.paymentSchedule.findMany({
    where: {
      loan: loanWhere,
      fechaVencimiento: { gte: selectedDate, lt: endDate },
      estado: { not: 'FINANCIADO' },
    },
    orderBy: [{ loan: { cobrador: { nombre: 'asc' } } }, { estado: 'asc' }, { montoEsperado: 'desc' }],
    include: {
      loan: {
        include: {
          branch: { select: { id: true, nombre: true } },
          cobrador: { select: { id: true, nombre: true } },
          client: { select: { id: true, nombreCompleto: true, telefono: true } },
          loanGroup: { select: { id: true, nombre: true } },
        },
      },
      // All payments for this schedule (to know if it was ever paid)
      payments: {
        select: {
          id: true,
          monto: true,
          metodoPago: true,
          statusTransferencia: true,
          fechaHora: true,
        },
        orderBy: { fechaHora: 'asc' },
        take: 1,
      },
    },
  })

  // Una transferencia PENDIENTE no cuenta como cobrado — queda "en validación"
  type SchedPayment = (typeof schedule)[number]['payments'][number]
  const isPendingTransfer = (p: SchedPayment) =>
    p.metodoPago === 'TRANSFER' && p.statusTransferencia === 'PENDIENTE'

  const cobrados     = schedule.filter((s) => s.payments.length > 0 && !isPendingTransfer(s.payments[0]))
  const enValidacion = schedule.filter((s) => s.payments.length > 0 && isPendingTransfer(s.payments[0]))
  // Solo PENDING/PARTIAL sin Payment cuentan como pendientes. Los PAID/ADVANCE
  // sin Payment son schedules absorbidos por renovaciones legacy (no son mora).
  const pendientes   = schedule.filter((s) =>
    s.payments.length === 0 && (s.estado === 'PENDING' || s.estado === 'PARTIAL')
  )

  const totalCobrado       = cobrados.reduce((sum, s) => sum + Number(s.payments[0].monto), 0)
  const totalEnValidacion  = enValidacion.reduce((sum, s) => sum + Number(s.payments[0].monto), 0)
  // "Sin cobrar" = solo pendientes reales (PENDING/PARTIAL sin Payment).
  // Excluye explícitamente PAID/ADVANCE/FINANCIADO sin Payment (legacy).
  const totalSinCobrar     = pendientes.reduce(
    (sum, s) => sum + Math.max(0, Number(s.montoEsperado) - Number(s.montoPagado)),
    0,
  )
  const isHabil = esDiaHabil(selectedDate)

  // ── Datos para impresión ─────────────────────────────────────────────────────
  const printRows = schedule.map((s) => {
    const overdue = isOverdue(s)
    return {
      clientNombre:  s.loan.client.nombreCompleto,
      numeroPago:    s.numeroPago,
      totalPagos:    s.loan.plazo,
      montoEsperado: Number(s.montoEsperado),
      diaPago:       (s.loan as { diaPago?: string | null }).diaPago ?? null,
      tipo:          s.loan.tipo,
      mora:          overdue ? Math.max(0, Number(s.montoEsperado) - Number(s.montoPagado)) : 0,
      grupo:         s.loan.loanGroup?.nombre ?? null,
      cobradorNombre: s.loan.cobrador?.nombre ?? null,
    }
  })
  const printBranch    = schedule[0]?.loan.branch.nombre ?? 'Sin sucursal'
  const printCobrador  = (() => {
    const names = Array.from(new Set(schedule.map((s) => s.loan.cobrador?.nombre).filter(Boolean)))
    return names.length === 1 ? (names[0] ?? 'Cobrador') : names.length > 1 ? 'Varios' : 'Cobrador'
  })()
  const printFechaLabel = formatDate(selectedDate, "EEEE d 'de' MMMM yyyy")

  // ── GERENTE / DIRECTOR: vista agrupada por sucursal → coordinador ─────────────
  if (isGerente || isDirector) {
    type Row = (typeof schedule)[number]

    const branchMap: Record<string, {
      branchNombre: string
      cobradores: Record<string, { cobradorNombre: string; rows: Row[] }>
    }> = {}

    for (const s of schedule) {
      const bId = s.loan.branchId
      const cId = s.loan.cobradorId ?? 'sin-asignar'
      if (!branchMap[bId]) branchMap[bId] = { branchNombre: s.loan.branch.nombre, cobradores: {} }
      if (!branchMap[bId].cobradores[cId]) {
        branchMap[bId].cobradores[cId] = {
          cobradorNombre: s.loan.cobrador?.nombre ?? 'Sin asignar',
          rows: [],
        }
      }
      branchMap[bId].cobradores[cId].rows.push(s)
    }

    return (
      <div className="p-4 space-y-5">
        {/* Header + date picker */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Cobranza</h1>
            <p className="text-sm text-muted-foreground">
              {formatDate(selectedDate, "EEEE d 'de' MMMM")} · {isHabil ? 'Día hábil' : 'No hábil'}
            </p>
          </div>
          <AgendaDatePicker fecha={fechaStr} fechaFin={hasFechaFin ? searchParams.fechaFin : undefined} baseHref="/cobros/agenda" maxDate={yesterdayStr} />
        </div>

        {/* Resumen */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
            <p className="text-xs text-emerald-400 font-medium">Cobrado</p>
            <p className="text-lg font-bold text-emerald-300">{formatMoney(totalCobrado)}</p>
            <p className="text-xs text-emerald-400/70">{cobrados.length} clientes</p>
            {enValidacion.length > 0 && (
              <p className="text-[10px] text-yellow-400/90 font-medium mt-1">
                + {enValidacion.length} en validación ({formatMoney(totalEnValidacion)})
              </p>
            )}
          </div>
          <div className={`rounded-lg p-3 border ${pendientes.length > 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-muted border-border'}`}>
            <p className={`text-xs font-medium ${pendientes.length > 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
              Sin cobrar
            </p>
            <p className={`text-lg font-bold ${pendientes.length > 0 ? 'text-red-300' : 'text-muted-foreground'}`}>
              {formatMoney(totalSinCobrar)}
            </p>
            <p className={`text-xs ${pendientes.length > 0 ? 'text-red-400/70' : 'text-muted-foreground'}`}>
              {pendientes.length} clientes
            </p>
          </div>
        </div>

        {Object.keys(branchMap).length === 0 && (
          <div className="text-center py-12">
            <Calendar className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Sin cobros programados para este día</p>
          </div>
        )}

        {Object.entries(branchMap).map(([bId, branch]) => (
          <div key={bId} className="space-y-3">
            {isDirector && (
              <div className="flex items-center gap-2 pt-2">
                <Building2 className="h-4 w-4 text-primary-600" />
                <h2 className="font-semibold text-gray-800">{branch.branchNombre}</h2>
                <span className="text-xs text-muted-foreground">
                  · {Object.values(branch.cobradores).flatMap((c) => c.rows).length} cobros
                </span>
              </div>
            )}

            {Object.entries(branch.cobradores).map(([cId, cobrador]) => {
              const cPagados      = cobrador.rows.filter((r) => r.payments.length > 0 && !isPendingTransfer(r.payments[0]))
              const cEnValidacion = cobrador.rows.filter((r) => r.payments.length > 0 && isPendingTransfer(r.payments[0]))
              const cPendientes   = cobrador.rows.filter((r) => r.payments.length === 0)
              const cCobrado      = cPagados.reduce((sum, r) => sum + Number(r.payments[0].monto), 0)

              return (
                <Card key={cId}>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <UserCheck className="h-4 w-4 text-primary-600" />
                        <span>{cobrador.cobradorNombre}</span>
                        {isGerente && (
                          <span className="text-xs text-muted-foreground font-normal">
                            ({branch.branchNombre})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs font-normal">
                        <span className="text-green-600">{cPagados.length} cobrados · {formatMoney(cCobrado)}</span>
                        {cEnValidacion.length > 0 && (
                          <>
                            <span className="text-muted-foreground">·</span>
                            <span className="text-yellow-400">{cEnValidacion.length} en validación</span>
                          </>
                        )}
                        {cPendientes.length > 0 && (
                          <>
                            <span className="text-muted-foreground">·</span>
                            <span className="text-red-600">{cPendientes.length} sin cobrar</span>
                          </>
                        )}
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-1">
                    {cPagados.map((row) => {
                      const pago = row.payments[0]
                      return (
                        <div key={row.id} className="flex items-center gap-3 py-2 px-3 rounded-lg text-sm bg-emerald-500/10 border border-emerald-500/15">
                          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <Link href={`/clientes/${row.loan.client.id}`} className="font-medium hover:underline truncate block">
                              {row.loan.client.nombreCompleto}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              {row.loan.tipo} · Pago #{row.numeroPago}
                              {row.loan.client.telefono && ` · ${row.loan.client.telefono}`}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-semibold text-emerald-300">{formatMoney(Number(pago.monto))}</p>
                            <p className="text-[10px] text-emerald-400/70">
                              {new Date(pago.fechaHora).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                    {cEnValidacion.map((row) => {
                      const pago = row.payments[0]
                      return (
                        <div key={row.id} className="flex items-center gap-3 py-2 px-3 rounded-lg text-sm bg-yellow-500/10 border border-yellow-500/20">
                          <Clock className="h-4 w-4 text-yellow-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <Link href={`/clientes/${row.loan.client.id}`} className="font-medium hover:underline truncate block">
                              {row.loan.client.nombreCompleto}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              {row.loan.tipo} · Pago #{row.numeroPago}
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
                    {cPendientes.map((row) => (
                      <div key={row.id} className="flex items-center gap-3 py-2 px-3 rounded-lg text-sm bg-red-500/10 border border-red-500/15">
                        <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <Link href={`/clientes/${row.loan.client.id}`} className="font-medium hover:underline truncate block">
                            {row.loan.client.nombreCompleto}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {row.loan.tipo} · Pago #{row.numeroPago}
                            {row.loan.client.telefono && ` · ${row.loan.client.telefono}`}
                          </p>
                        </div>
                        <p className="font-semibold text-red-300 shrink-0">{formatMoney(Number(row.montoEsperado))}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        ))}

      {/* Imprimir — gerente/director */}
      <div className="flex justify-center pt-2">
        <ImprimirAgendaButton
          rows={printRows}
          fechaLabel={printFechaLabel}
          branchNombre={printBranch}
          cobradorNombre={printCobrador}
        />
      </div>
    </div>
  )
  }

  // ── COORDINADOR / COBRADOR: vista simple propia ───────────────────────────────

  // Agrupar por grupo SOLIDARIO
  function agrupar(items: typeof schedule) {
    const grupos = new Map<string, { groupId: string; groupNombre: string; items: typeof schedule }>()
    const individuales: typeof schedule = []
    for (const s of items) {
      const g = s.loan.loanGroup
      if (g) {
        if (!grupos.has(g.id)) grupos.set(g.id, { groupId: g.id, groupNombre: g.nombre, items: [] })
        grupos.get(g.id)!.items.push(s)
      } else {
        individuales.push(s)
      }
    }
    return { grupos: Array.from(grupos.values()), individuales }
  }

  const { grupos: gruposPendientes, individuales: individualesPendientes } = agrupar(pendientes)
  const { grupos: gruposCobrados, individuales: individualesCobrados } = agrupar(cobrados)
  const { grupos: gruposValidacion, individuales: individualesValidacion } = agrupar(enValidacion)

  return (
    <div className="p-4 space-y-5">
      {/* Header + date picker */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cobranza</h1>
          <p className="text-sm text-muted-foreground">
            {formatDate(selectedDate, "EEEE d 'de' MMMM")} · {isHabil ? 'Día hábil' : 'No hábil'}
          </p>
        </div>
        <AgendaDatePicker fecha={fechaStr} baseHref="/cobros/agenda" maxDate={yesterdayStr} />
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
          <p className="text-xs text-emerald-400 font-medium">Cobrado</p>
          <p className="text-lg font-bold text-emerald-300">{formatMoney(totalCobrado)}</p>
          <p className="text-xs text-emerald-400/70">{cobrados.length} clientes</p>
          {enValidacion.length > 0 && (
            <p className="text-[10px] text-yellow-400/90 font-medium mt-1">
              + {enValidacion.length} en validación ({formatMoney(totalEnValidacion)})
            </p>
          )}
        </div>
        <div className={`rounded-lg p-3 border ${pendientes.length > 0 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-muted border-border'}`}>
          <p className={`text-xs font-medium ${pendientes.length > 0 ? 'text-amber-400' : 'text-muted-foreground'}`}>
            {isToday ? 'Por cobrar' : 'Sin cobrar'}
          </p>
          <p className={`text-lg font-bold ${pendientes.length > 0 ? 'text-amber-300' : 'text-muted-foreground'}`}>
            {formatMoney(totalSinCobrar)}
          </p>
          <p className={`text-xs ${pendientes.length > 0 ? 'text-amber-400/70' : 'text-muted-foreground'}`}>
            {pendientes.length} clientes
          </p>
        </div>
      </div>

      {/* Sin cobrar / pendientes */}
      {(gruposPendientes.length > 0 || individualesPendientes.length > 0) && (
        <section>
          <h2 className={`text-sm font-semibold mb-2 ${isToday ? 'text-amber-400' : 'text-red-400'}`}>
            {isToday ? '🟡 Pendientes' : '🔴 Sin cobrar'} ({pendientes.length})
          </h2>
          <div className="space-y-2">
            {gruposPendientes.map((g) => (
              <GrupoCard key={g.groupId} {...g} variant={isToday ? 'pending' : 'uncollected'} isToday={isToday} />
            ))}
            {individualesPendientes.map((s) => (
              <AgendaItem key={s.id} schedule={s} variant={isToday ? 'pending' : 'uncollected'} isToday={isToday} />
            ))}
          </div>
        </section>
      )}

      {/* En validación (transferencias pendientes de verificar) */}
      {(gruposValidacion.length > 0 || individualesValidacion.length > 0) && (
        <section>
          <h2 className="text-sm font-semibold text-yellow-400 mb-2">
            🕒 En validación ({enValidacion.length})
          </h2>
          <div className="space-y-2">
            {gruposValidacion.map((g) => (
              <GrupoCard key={g.groupId} {...g} variant="validation" isToday={isToday} />
            ))}
            {individualesValidacion.map((s) => (
              <AgendaItem key={s.id} schedule={s} variant="validation" isToday={isToday} />
            ))}
          </div>
        </section>
      )}

      {/* Cobrados */}
      {(gruposCobrados.length > 0 || individualesCobrados.length > 0) && (
        <section>
          <h2 className="text-sm font-semibold text-emerald-400 mb-2">
            ✅ Cobrados ({cobrados.length})
          </h2>
          <div className="space-y-2">
            {gruposCobrados.map((g) => (
              <GrupoCard key={g.groupId} {...g} variant="collected" isToday={isToday} />
            ))}
            {individualesCobrados.map((s) => (
              <AgendaItem key={s.id} schedule={s} variant="collected" isToday={isToday} />
            ))}
          </div>
        </section>
      )}

      {schedule.length === 0 && (
        <div className="text-center py-12">
          <Calendar className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Sin cobros programados para este día</p>
        </div>
      )}

      {/* Imprimir — coordinador/cobrador */}
      {schedule.length > 0 && (
        <div className="flex justify-center pt-2">
          <ImprimirAgendaButton
            rows={printRows}
            fechaLabel={printFechaLabel}
            branchNombre={printBranch}
            cobradorNombre={printCobrador}
          />
        </div>
      )}
    </div>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface GroupScheduleItem {
  id: string
  numeroPago: number
  montoEsperado: number | { toNumber: () => number }
  payments: { id: string; monto: number | { toNumber: () => number }; metodoPago: string; fechaHora: Date | string }[]
  loan: {
    plazo: number
    tipo: string
    client: { nombreCompleto: string; telefono: string | null }
  }
}

type Variant = 'pending' | 'uncollected' | 'collected' | 'validation'

// ── Tarjeta de grupo Solidario ─────────────────────────────────────────────────

function GrupoCard({
  groupId,
  groupNombre,
  items,
  variant,
}: {
  groupId: string
  groupNombre: string
  items: GroupScheduleItem[]
  variant: Variant
  isToday: boolean
}) {
  const total = items.reduce((s, i) => {
    const m = typeof i.montoEsperado === 'number' ? i.montoEsperado : i.montoEsperado.toNumber()
    return s + m
  }, 0)
  const borderColor = variant === 'collected' ? 'border-l-green-500'
    : variant === 'pending' ? 'border-l-yellow-400'
    : variant === 'validation' ? 'border-l-yellow-400'
    : 'border-l-red-500'

  return (
    <Link href={`/cobros/grupo/${groupId}`}>
      <Card className={`border-l-4 ${borderColor}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary-600" />
              <p className="font-semibold text-gray-900">{groupNombre}</p>
              <span className="text-xs bg-primary-100 text-primary-700 rounded-full px-2 py-0.5">
                {items.length} integrantes
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-900">{formatMoney(total)}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
          <div className="space-y-1">
            {items.map((s) => {
              const m = typeof s.montoEsperado === 'number' ? s.montoEsperado : s.montoEsperado.toNumber()
              return (
                <div key={s.id} className="flex justify-between text-xs text-muted-foreground">
                  <span>{s.loan.client.nombreCompleto}</span>
                  <span>{formatMoney(m)}</span>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

// ── Tarjeta individual ────────────────────────────────────────────────────────

function AgendaItem({
  schedule,
  variant,
  isToday,
}: {
  schedule: GroupScheduleItem
  variant: Variant
  isToday: boolean
}) {
  const monto = typeof schedule.montoEsperado === 'number'
    ? schedule.montoEsperado
    : schedule.montoEsperado.toNumber()

  const borderColor = variant === 'collected' ? 'border-l-green-500'
    : variant === 'pending' ? 'border-l-yellow-400'
    : variant === 'validation' ? 'border-l-yellow-400'
    : 'border-l-red-500'

  const StatusIcon = variant === 'collected' ? CheckCircle2
    : variant === 'validation' ? Clock
    : variant === 'pending' ? null
    : XCircle
  const iconColor  = variant === 'collected' ? 'text-emerald-400'
    : variant === 'validation' ? 'text-yellow-400'
    : 'text-red-400'

  const href = isToday && variant === 'pending' ? `/cobros/capturar/${schedule.id}` : '#'

  const pago = schedule.payments[0]

  return (
    <Link href={href}>
      <Card className={`border-l-4 ${borderColor} ${variant === 'collected' ? 'bg-emerald-500/5' : variant === 'validation' ? 'bg-yellow-500/5' : ''}`}>
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {StatusIcon && <StatusIcon className={`h-4 w-4 ${iconColor} shrink-0`} />}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">{schedule.loan.client.nombreCompleto}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pago {schedule.numeroPago} de {schedule.loan.plazo} · {schedule.loan.tipo}
                {schedule.loan.client.telefono && ` · ${schedule.loan.client.telefono}`}
              </p>
              {pago && variant === 'collected' && (
                <p className="text-xs text-emerald-400 mt-0.5">
                  Cobrado el {new Date(pago.fechaHora).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                  {pago.metodoPago === 'CASH' ? ' · 💵' : pago.metodoPago === 'TRANSFER' ? ' · 🏦' : ' · 💳'}
                </p>
              )}
              {pago && variant === 'validation' && (
                <p className="text-xs text-yellow-400 mt-0.5">
                  🏦 Transferencia pendiente de verificación por el Gerente Zonal
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 ml-3 shrink-0">
            <span className={`font-bold ${variant === 'collected' ? 'text-emerald-300' : variant === 'validation' ? 'text-yellow-300' : 'text-foreground'}`}>
              {formatMoney(monto)}
            </span>
            {isToday && variant === 'pending' && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
