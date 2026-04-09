import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import Link from 'next/link'
import { formatMoney, formatDate } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Calendar, ChevronRight, Building2, User } from 'lucide-react'
import { esDiaHabil } from '@/lib/business-days'

// ─── Types ───────────────────────────────────────────────────────────────────

type ScheduleItem = Prisma.PaymentScheduleGetPayload<{
  include: {
    loan: {
      include: {
        client: { select: { nombreCompleto: true; telefono: true } }
        cobrador: { select: { nombre: true } }
        branch: { select: { nombre: true } }
      }
    }
  }
}>

type CobradorGroup = {
  cobradorId: string
  nombre: string
  items: ScheduleItem[]
}

type BranchGroup = {
  branchId: string
  nombre: string
  coordinadores: CobradorGroup[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function groupByCobrador(items: ScheduleItem[]): CobradorGroup[] {
  const map = new Map<string, CobradorGroup>()
  for (const s of items) {
    const id = s.loan.cobradorId
    if (!map.has(id)) {
      map.set(id, { cobradorId: id, nombre: s.loan.cobrador.nombre, items: [] })
    }
    map.get(id)!.items.push(s)
  }
  return Array.from(map.values())
}

function groupByBranch(items: ScheduleItem[]): BranchGroup[] {
  const map = new Map<string, ScheduleItem[]>()
  for (const s of items) {
    const bId = s.loan.branchId
    if (!map.has(bId)) map.set(bId, [])
    map.get(bId)!.push(s)
  }
  return Array.from(map.entries()).map(([branchId, bItems]) => ({
    branchId,
    nombre: bItems[0].loan.branch.nombre,
    coordinadores: groupByCobrador(bItems),
  }))
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function CobranzaPage() {
  const session = await getSession()
  if (!session?.user) return null

  const { companyId, branchId, rol, email } = session.user

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const loanFilter: Prisma.LoanWhereInput = { estado: 'ACTIVE' }

  if (rol === 'COBRADOR') {
    const cobrador = await prisma.user.findFirst({
      where: { companyId: companyId!, email: email! },
    })
    if (!cobrador) return null
    loanFilter.cobradorId = cobrador.id
  } else if (rol === 'GERENTE') {
    if (branchId) loanFilter.branchId = branchId
    else loanFilter.companyId = companyId!
  }

  // Cobranza: ONLY payments from previous days (strictly before today)
  const schedule = await prisma.paymentSchedule.findMany({
    where: {
      loan: loanFilter,
      estado: { in: ['PENDING', 'OVERDUE', 'PARTIAL'] },
      fechaVencimiento: { lt: today },
    },
    orderBy: [
      { fechaVencimiento: 'asc' },
      { montoEsperado: 'desc' },
    ],
    include: {
      loan: {
        include: {
          client: { select: { nombreCompleto: true, telefono: true } },
          cobrador: { select: { nombre: true } },
          branch: { select: { nombre: true } },
        },
      },
    },
  })

  const totalEsperado = schedule.reduce(
    (sum: number, s) => sum + s.montoEsperado.toNumber(),
    0
  )
  const isHabil = esDiaHabil(today)

  const isDirector = rol === 'GERENTE' && !branchId
  const isGerente = rol === 'GERENTE' && !!branchId

  const byBranch = isDirector ? groupByBranch(schedule) : []
  const byCobrador = isGerente ? groupByCobrador(schedule) : []

  return (
    <div className="p-4 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Cobranza</h1>
        <p className="text-sm text-muted-foreground">
          Pagos vencidos de días anteriores ·{' '}
          {formatDate(today, "EEEE d 'de' MMMM")} ·{' '}
          {isHabil ? 'Día hábil' : 'No hábil'}
        </p>
      </div>

      {/* Métricas globales */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-red-50 rounded-lg p-3">
          <p className="text-xs text-red-600 font-medium">Por cobrar (vencido)</p>
          <p className="text-lg font-bold text-red-800 money">{formatMoney(totalEsperado)}</p>
        </div>
        <div className="bg-yellow-50 rounded-lg p-3">
          <p className="text-xs text-yellow-600 font-medium">Clientes con deuda</p>
          <p className="text-lg font-bold text-yellow-800">{schedule.length}</p>
        </div>
      </div>

      {schedule.length === 0 && (
        <div className="text-center py-12">
          <Calendar className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Sin pagos vencidos pendientes</p>
        </div>
      )}

      {/* COORDINADOR — lista plana propia */}
      {rol === 'COBRADOR' && schedule.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-red-600 mb-2">
            Pagos vencidos ({schedule.length})
          </h2>
          <div className="space-y-2">
            {schedule.map((s) => (
              <VencidoCard key={s.id} item={s} />
            ))}
          </div>
        </section>
      )}

      {/* GERENTE — agrupado por coordinador */}
      {isGerente && schedule.length > 0 && (
        <div className="space-y-6">
          {byCobrador.map((group) => (
            <CobradorSection key={group.cobradorId} group={group} />
          ))}
        </div>
      )}

      {/* DIRECTOR — agrupado por sucursal → coordinador */}
      {isDirector && schedule.length > 0 && (
        <div className="space-y-8">
          {byBranch.map((branch) => {
            const total = branch.coordinadores.reduce((n, c) => n + c.items.length, 0)
            const totalBranch = branch.coordinadores.reduce(
              (sum: number, c) =>
                sum + c.items.reduce((s: number, i) => s + i.montoEsperado.toNumber(), 0),
              0
            )
            return (
              <div key={branch.branchId}>
                <div className="flex items-center gap-2 pb-1 border-b border-gray-200 mb-3">
                  <Building2 className="h-4 w-4 text-red-500" />
                  <h2 className="text-base font-bold text-gray-900">{branch.nombre}</h2>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {total} vencidos · {formatMoney(totalBranch)}
                  </span>
                </div>
                <div className="space-y-5 pl-2">
                  {branch.coordinadores.map((coord) => (
                    <CobradorSection key={coord.cobradorId} group={coord} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Components ──────────────────────────────────────────────────────────────

function CobradorSection({ group }: { group: CobradorGroup }) {
  const totalMonto = group.items.reduce(
    (sum: number, s) => sum + s.montoEsperado.toNumber(),
    0
  )
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <User className="h-4 w-4 text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-700">{group.nombre}</h3>
        <span className="text-xs text-muted-foreground">
          {group.items.length} vencidos · {formatMoney(totalMonto)}
        </span>
      </div>
      <div className="space-y-2">
        {group.items.map((s) => (
          <VencidoCard key={s.id} item={s} />
        ))}
      </div>
    </div>
  )
}

function VencidoCard({ item }: { item: ScheduleItem }) {
  const monto = item.montoEsperado.toNumber()
  return (
    <Link href={`/cobros/capturar/${item.id}`}>
      <Card className="border-l-4 border-l-red-500">
        <CardContent className="flex items-center justify-between p-3">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 truncate text-sm">
              {item.loan.client.nombreCompleto}
            </p>
            <p className="text-xs text-muted-foreground">
              Pago {item.numeroPago} de {item.loan.plazo} · {item.loan.tipo}
              {item.loan.client.telefono && ` · ${item.loan.client.telefono}`}
            </p>
            <p className="text-xs text-red-500 mt-0.5">
              Venció el {formatDate(item.fechaVencimiento, "d 'de' MMMM")}
            </p>
          </div>
          <div className="flex items-center gap-2 ml-3">
            <span className="font-bold text-gray-900 text-sm money">{formatMoney(monto)}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
