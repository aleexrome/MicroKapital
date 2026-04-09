import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import Link from 'next/link'
import { formatMoney, formatDate } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { CalendarCheck, ChevronRight, CheckCircle2, Building2, User } from 'lucide-react'
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

export default async function PactadosPage() {
  const session = await getSession()
  if (!session?.user) return null

  const { companyId, branchId, rol, email } = session.user

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

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

  const schedule = await prisma.paymentSchedule.findMany({
    where: {
      loan: loanFilter,
      fechaVencimiento: { gte: today, lt: tomorrow },
    },
    orderBy: [{ montoEsperado: 'desc' }],
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

  const cobrados = schedule.filter((s) => s.estado === 'PAID')
  const pendientes = schedule.filter((s) => s.estado !== 'PAID')
  const avance =
    schedule.length > 0 ? Math.round((cobrados.length / schedule.length) * 100) : 0
  const isHabil = esDiaHabil(today)

  const isDirector = rol === 'GERENTE' && !branchId
  const isGerente = rol === 'GERENTE' && !!branchId

  const byBranch = isDirector ? groupByBranch(schedule) : []
  const byCobrador = isGerente ? groupByCobrador(schedule) : []

  return (
    <div className="p-4 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Pactados del día</h1>
        <p className="text-sm text-muted-foreground">
          {formatDate(today, "EEEE d 'de' MMMM")} · {isHabil ? 'Día hábil' : 'No hábil'}
        </p>
      </div>

      {/* Métricas globales */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 font-medium">Pactados</p>
          <p className="text-lg font-bold text-gray-800">{schedule.length}</p>
        </div>
        <div className="bg-green-50 rounded-lg p-3">
          <p className="text-xs text-green-600 font-medium">Cobrados</p>
          <p className="text-lg font-bold text-green-800">{cobrados.length}</p>
        </div>
        <div className="bg-yellow-50 rounded-lg p-3">
          <p className="text-xs text-yellow-600 font-medium">Pendientes</p>
          <p className="text-lg font-bold text-yellow-800">{pendientes.length}</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-3">
          <p className="text-xs text-blue-600 font-medium">Avance</p>
          <p className="text-lg font-bold text-blue-800">{avance}%</p>
        </div>
      </div>

      {schedule.length === 0 && (
        <div className="text-center py-12">
          <CalendarCheck className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No hay pagos programados para hoy</p>
        </div>
      )}

      {/* COORDINADOR — lista plana propia */}
      {rol === 'COBRADOR' && schedule.length > 0 && (
        <div className="space-y-4">
          {pendientes.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-yellow-600 mb-2">
                Pendientes ({pendientes.length})
              </h2>
              <div className="space-y-2">
                {pendientes.map((s) => (
                  <PagoCard key={s.id} item={s} />
                ))}
              </div>
            </section>
          )}
          {cobrados.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-green-600 mb-2">
                Cobrados ({cobrados.length})
              </h2>
              <div className="space-y-2">
                {cobrados.map((s) => (
                  <PagoCard key={s.id} item={s} paid />
                ))}
              </div>
            </section>
          )}
        </div>
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
            const done = branch.coordinadores.reduce(
              (n, c) => n + c.items.filter((s) => s.estado === 'PAID').length,
              0
            )
            return (
              <div key={branch.branchId}>
                <div className="flex items-center gap-2 pb-1 border-b border-gray-200 mb-3">
                  <Building2 className="h-4 w-4 text-primary-600" />
                  <h2 className="text-base font-bold text-gray-900">{branch.nombre}</h2>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {done}/{total} cobrados
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
  const cobrados = group.items.filter((s) => s.estado === 'PAID')
  const pendientes = group.items.filter((s) => s.estado !== 'PAID')
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <User className="h-4 w-4 text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-700">{group.nombre}</h3>
        <span className="text-xs text-muted-foreground">
          {cobrados.length}/{group.items.length} cobrados
        </span>
      </div>
      <div className="space-y-2">
        {pendientes.map((s) => (
          <PagoCard key={s.id} item={s} />
        ))}
        {cobrados.map((s) => (
          <PagoCard key={s.id} item={s} paid />
        ))}
      </div>
    </div>
  )
}

function PagoCard({ item, paid = false }: { item: ScheduleItem; paid?: boolean }) {
  const monto = item.montoEsperado.toNumber()

  if (paid) {
    return (
      <Card className="border-l-4 border-l-green-400 opacity-75">
        <CardContent className="flex items-center justify-between p-3">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-700 truncate text-sm">
              {item.loan.client.nombreCompleto}
            </p>
            <p className="text-xs text-muted-foreground">
              Pago {item.numeroPago} de {item.loan.plazo} · {item.loan.tipo}
            </p>
          </div>
          <div className="flex items-center gap-2 ml-3">
            <span className="font-bold text-gray-500 text-sm money">{formatMoney(monto)}</span>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Link href={`/cobros/capturar/${item.id}`}>
      <Card className="border-l-4 border-l-yellow-400">
        <CardContent className="flex items-center justify-between p-3">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 truncate text-sm">
              {item.loan.client.nombreCompleto}
            </p>
            <p className="text-xs text-muted-foreground">
              Pago {item.numeroPago} de {item.loan.plazo} · {item.loan.tipo}
              {item.loan.client.telefono && ` · ${item.loan.client.telefono}`}
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
