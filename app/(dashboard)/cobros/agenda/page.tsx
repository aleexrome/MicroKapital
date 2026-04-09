import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { formatMoney, formatDate } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Calendar, ChevronRight, Users, CheckCircle2, XCircle } from 'lucide-react'
import { esDiaHabil } from '@/lib/business-days'
import { AgendaDatePicker } from '@/components/cobros/AgendaDatePicker'

function parseDate(dateStr?: string): Date {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }
  return new Date(dateStr + 'T00:00:00')
}

function toYMD(d: Date) {
  return d.toISOString().split('T')[0]
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: { fecha?: string }
}) {
  const session = await getSession()
  if (!session?.user) return null

  const { id: cobradorId } = session.user

  const selectedDate = parseDate(searchParams.fecha)
  const nextDay = new Date(selectedDate)
  nextDay.setDate(nextDay.getDate() + 1)
  const fechaStr = toYMD(selectedDate)
  const isToday = fechaStr === toYMD(new Date())

  const schedule = await prisma.paymentSchedule.findMany({
    where: {
      loan: { cobradorId, estado: 'ACTIVE' },
      fechaVencimiento: { gte: selectedDate, lt: nextDay },
    },
    orderBy: [{ estado: 'asc' }, { montoEsperado: 'desc' }],
    include: {
      loan: {
        include: {
          client: { select: { nombreCompleto: true, telefono: true } },
          loanGroup: { select: { id: true, nombre: true } },
        },
      },
      // All payments for this schedule (to know if it was ever paid)
      payments: {
        select: {
          id: true,
          monto: true,
          metodoPago: true,
          fechaHora: true,
        },
        orderBy: { fechaHora: 'asc' },
        take: 1,
      },
    },
  })

  const cobrados  = schedule.filter((s) => s.payments.length > 0)
  const pendientes = schedule.filter((s) => s.payments.length === 0)

  const totalEsperado = schedule.reduce((sum, s) => sum + Number(s.montoEsperado), 0)
  const totalCobrado  = cobrados.reduce((sum, s) => sum + Number(s.payments[0].monto), 0)
  const isHabil = esDiaHabil(selectedDate)

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
        <AgendaDatePicker fecha={fechaStr} baseHref="/cobros/agenda" />
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-green-50 rounded-lg p-3">
          <p className="text-xs text-green-600 font-medium">Cobrado</p>
          <p className="text-lg font-bold text-green-700">{formatMoney(totalCobrado)}</p>
          <p className="text-xs text-green-600">{cobrados.length} clientes</p>
        </div>
        <div className={`rounded-lg p-3 ${pendientes.length > 0 ? 'bg-amber-50' : 'bg-gray-50'}`}>
          <p className={`text-xs font-medium ${pendientes.length > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
            {isToday ? 'Por cobrar' : 'Sin cobrar'}
          </p>
          <p className={`text-lg font-bold ${pendientes.length > 0 ? 'text-amber-700' : 'text-gray-500'}`}>
            {formatMoney(totalEsperado - totalCobrado)}
          </p>
          <p className={`text-xs ${pendientes.length > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
            {pendientes.length} clientes
          </p>
        </div>
      </div>

      {/* Sin cobrar / pendientes */}
      {(gruposPendientes.length > 0 || individualesPendientes.length > 0) && (
        <section>
          <h2 className={`text-sm font-semibold mb-2 ${isToday ? 'text-amber-600' : 'text-red-600'}`}>
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

      {/* Cobrados */}
      {(gruposCobrados.length > 0 || individualesCobrados.length > 0) && (
        <section>
          <h2 className="text-sm font-semibold text-green-600 mb-2">
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

type Variant = 'pending' | 'uncollected' | 'collected'

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
  const borderColor = variant === 'collected' ? 'border-l-green-500' : variant === 'pending' ? 'border-l-yellow-400' : 'border-l-red-500'

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

  const borderColor = variant === 'collected' ? 'border-l-green-500' : variant === 'pending' ? 'border-l-yellow-400' : 'border-l-red-500'

  const StatusIcon = variant === 'collected' ? CheckCircle2 : variant === 'pending' ? null : XCircle
  const iconColor  = variant === 'collected' ? 'text-green-500' : 'text-red-500'

  const href = isToday && variant === 'pending' ? `/cobros/capturar/${schedule.id}` : '#'

  const pago = schedule.payments[0]

  return (
    <Link href={href}>
      <Card className={`border-l-4 ${borderColor} ${variant === 'collected' ? 'bg-green-50/30' : ''}`}>
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {StatusIcon && <StatusIcon className={`h-4 w-4 ${iconColor} shrink-0`} />}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">{schedule.loan.client.nombreCompleto}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pago {schedule.numeroPago} de {schedule.loan.plazo} · {schedule.loan.tipo}
                {schedule.loan.client.telefono && ` · ${schedule.loan.client.telefono}`}
              </p>
              {pago && (
                <p className="text-xs text-green-600 mt-0.5">
                  Cobrado el {new Date(pago.fechaHora).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                  {pago.metodoPago === 'CASH' ? ' · 💵' : pago.metodoPago === 'TRANSFER' ? ' · 🏦' : ' · 💳'}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 ml-3 shrink-0">
            <span className={`font-bold ${variant === 'collected' ? 'text-green-700' : 'text-gray-900'}`}>
              {formatMoney(monto)}
            </span>
            {isToday && variant === 'pending' && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
