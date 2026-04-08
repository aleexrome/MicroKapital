import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { formatMoney, formatDate } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Calendar, ChevronRight, Users } from 'lucide-react'
import { esDiaHabil } from '@/lib/business-days'

export default async function AgendaPage() {
  const session = await getSession()
  if (!session?.user) return null

  const { id: cobradorId } = session.user

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const schedule = await prisma.paymentSchedule.findMany({
    where: {
      loan: { cobradorId, estado: 'ACTIVE' },
      estado: { in: ['PENDING', 'OVERDUE', 'PARTIAL'] },
      fechaVencimiento: { lte: tomorrow },
    },
    orderBy: [{ estado: 'asc' }, { montoEsperado: 'desc' }],
    include: {
      loan: {
        include: {
          client: { select: { nombreCompleto: true, telefono: true } },
          loanGroup: { select: { id: true, nombre: true } },
        },
      },
    },
  })

  // Separar vencidos vs. de hoy
  const vencidos = schedule.filter((s) => s.estado === 'OVERDUE' || s.fechaVencimiento < today)
  const dehoy    = schedule.filter((s) => s.estado !== 'OVERDUE' && s.fechaVencimiento >= today)

  const totalEsperado = schedule.reduce((sum, s) => sum + Number(s.montoEsperado), 0)
  const isHabil = esDiaHabil(today)

  // Agrupar items de hoy por grupo SOLIDARIO
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

  const { grupos: gruposHoy, individuales: individualesHoy } = agrupar(dehoy)
  const { grupos: gruposVencidos, individuales: individualesVencidos } = agrupar(vencidos)

  return (
    <div className="p-4 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Pactados del Día</h1>
        <p className="text-sm text-muted-foreground">
          {formatDate(today, "EEEE d 'de' MMMM")} · {isHabil ? 'Día hábil' : 'No hábil'}
        </p>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-primary-50 rounded-lg p-3">
          <p className="text-xs text-primary-600 font-medium">Por cobrar</p>
          <p className="text-lg font-bold text-primary-800">{formatMoney(totalEsperado)}</p>
        </div>
        <div className="bg-yellow-50 rounded-lg p-3">
          <p className="text-xs text-yellow-600 font-medium">Cobros</p>
          <p className="text-lg font-bold text-yellow-800">{schedule.length} clientes</p>
        </div>
      </div>

      {/* Vencidos */}
      {(gruposVencidos.length > 0 || individualesVencidos.length > 0) && (
        <section>
          <h2 className="text-sm font-semibold text-red-600 mb-2">🔴 Vencidos ({vencidos.length})</h2>
          <div className="space-y-2">
            {gruposVencidos.map((g) => (
              <GrupoCard key={g.groupId} {...g} variant="overdue" />
            ))}
            {individualesVencidos.map((s) => (
              <AgendaItem key={s.id} schedule={s} variant="overdue" />
            ))}
          </div>
        </section>
      )}

      {/* De hoy */}
      {(gruposHoy.length > 0 || individualesHoy.length > 0) && (
        <section>
          <h2 className="text-sm font-semibold text-yellow-600 mb-2">🟡 Hoy ({dehoy.length})</h2>
          <div className="space-y-2">
            {gruposHoy.map((g) => (
              <GrupoCard key={g.groupId} {...g} variant="today" />
            ))}
            {individualesHoy.map((s) => (
              <AgendaItem key={s.id} schedule={s} variant="today" />
            ))}
          </div>
        </section>
      )}

      {schedule.length === 0 && (
        <div className="text-center py-12">
          <Calendar className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Sin cobros pendientes para hoy</p>
        </div>
      )}
    </div>
  )
}

// ── Tarjeta de grupo Solidario ────────────────────────────────────────────────

interface GroupScheduleItem {
  id: string
  numeroPago: number
  montoEsperado: number | { toNumber: () => number }
  loan: {
    plazo: number
    tipo: string
    client: { nombreCompleto: string; telefono: string | null }
  }
}

function GrupoCard({
  groupId,
  groupNombre,
  items,
  variant,
}: {
  groupId: string
  groupNombre: string
  items: GroupScheduleItem[]
  variant: 'overdue' | 'today'
}) {
  const total = items.reduce((s, i) => {
    const m = typeof i.montoEsperado === 'number' ? i.montoEsperado : i.montoEsperado.toNumber()
    return s + m
  }, 0)
  const borderColor = variant === 'overdue' ? 'border-l-red-500' : 'border-l-yellow-400'

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
}: {
  schedule: GroupScheduleItem
  variant: 'overdue' | 'today'
}) {
  const monto = typeof schedule.montoEsperado === 'number'
    ? schedule.montoEsperado
    : schedule.montoEsperado.toNumber()
  const borderColor = variant === 'overdue' ? 'border-l-red-500' : 'border-l-yellow-400'

  return (
    <Link href={`/cobros/capturar/${schedule.id}`}>
      <Card className={`border-l-4 ${borderColor}`}>
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 truncate">{schedule.loan.client.nombreCompleto}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pago {schedule.numeroPago} de {schedule.loan.plazo} · {schedule.loan.tipo}
              {schedule.loan.client.telefono && ` · ${schedule.loan.client.telefono}`}
            </p>
          </div>
          <div className="flex items-center gap-2 ml-3">
            <span className="font-bold text-gray-900">{formatMoney(monto)}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
