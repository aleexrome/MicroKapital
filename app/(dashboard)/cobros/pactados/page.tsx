import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { formatMoney, formatDate } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { CalendarCheck, ChevronRight, CheckCircle2 } from 'lucide-react'
import { esDiaHabil } from '@/lib/business-days'

export default async function PactadosPage() {
  const session = await getSession()
  if (!session?.user) return null

  const { companyId, branchId, rol, email } = session.user

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  // Build loan filter based on role
  type LoanFilter = {
    estado: string
    cobradorId?: string
    branchId?: string
    companyId?: string
  }
  const loanFilter: LoanFilter = { estado: 'ACTIVE' }

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

  // Pactados del día: ALL scheduled payments for today (any status)
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
        },
      },
    },
  })

  const cobrados = schedule.filter((s) => s.estado === 'PAID')
  const pendientes = schedule.filter((s) => s.estado !== 'PAID')
  const avance =
    schedule.length > 0 ? Math.round((cobrados.length / schedule.length) * 100) : 0
  const isHabil = esDiaHabil(today)

  return (
    <div className="p-4 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Pactados del día</h1>
        <p className="text-sm text-muted-foreground">
          {formatDate(today, "EEEE d 'de' MMMM")} · {isHabil ? 'Día hábil' : 'No hábil'}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 font-medium">Pactados</p>
          <p className="text-lg font-bold text-gray-800">{schedule.length}</p>
        </div>
        <div className="bg-green-50 rounded-lg p-3">
          <p className="text-xs text-green-600 font-medium">Cobrados</p>
          <p className="text-lg font-bold text-green-800">{cobrados.length}</p>
          {cobrados.length > 0 && (
            <p className="text-xs text-green-600 money">
              {formatMoney(
                cobrados.reduce((sum, s) => sum + Number(s.montoPagado), 0)
              )}
            </p>
          )}
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

      {/* Pending */}
      {pendientes.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-yellow-600 mb-2">
            Pendientes de cobrar ({pendientes.length})
          </h2>
          <div className="space-y-2">
            {pendientes.map((s) => (
              <PactadoItem key={s.id} schedule={s} />
            ))}
          </div>
        </section>
      )}

      {/* Already collected */}
      {cobrados.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-green-600 mb-2">
            Cobrados ({cobrados.length})
          </h2>
          <div className="space-y-2">
            {cobrados.map((s) => (
              <PactadoItem key={s.id} schedule={s} paid />
            ))}
          </div>
        </section>
      )}

      {schedule.length === 0 && (
        <div className="text-center py-12">
          <CalendarCheck className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No hay pagos programados para hoy</p>
        </div>
      )}
    </div>
  )
}

function PactadoItem({
  schedule,
  paid = false,
}: {
  schedule: {
    id: string
    numeroPago: number
    montoEsperado: number | { toNumber: () => number }
    montoPagado: number | { toNumber: () => number }
    loan: {
      plazo: number
      tipo: string
      client: { nombreCompleto: string; telefono: string | null }
    }
  }
  paid?: boolean
}) {
  const monto =
    typeof schedule.montoEsperado === 'number'
      ? schedule.montoEsperado
      : (schedule.montoEsperado as { toNumber: () => number }).toNumber()

  if (paid) {
    return (
      <Card className="border-l-4 border-l-green-400 opacity-75">
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-700 truncate">
              {schedule.loan.client.nombreCompleto}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pago {schedule.numeroPago} de {schedule.loan.plazo} · {schedule.loan.tipo}
            </p>
          </div>
          <div className="flex items-center gap-2 ml-3">
            <span className="font-bold text-gray-500 money">{formatMoney(monto)}</span>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Link href={`/cobros/capturar/${schedule.id}`}>
      <Card className="border-l-4 border-l-yellow-400">
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 truncate">
              {schedule.loan.client.nombreCompleto}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pago {schedule.numeroPago} de {schedule.loan.plazo} · {schedule.loan.tipo}
              {schedule.loan.client.telefono && ` · ${schedule.loan.client.telefono}`}
            </p>
          </div>
          <div className="flex items-center gap-2 ml-3">
            <span className="font-bold text-gray-900 money">{formatMoney(monto)}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
