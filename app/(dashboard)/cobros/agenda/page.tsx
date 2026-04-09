import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import Link from 'next/link'
import { formatMoney, formatDate } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Calendar, ChevronRight } from 'lucide-react'
import { esDiaHabil } from '@/lib/business-days'

export default async function AgendaPage() {
  const session = await getSession()
  if (!session?.user) return null

  const { companyId, branchId, rol, email } = session.user

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Build loan filter based on role
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

  // Agenda: ONLY payments from previous days (strictly before today)
  const schedule = await prisma.paymentSchedule.findMany({
    where: {
      loan: loanFilter,
      estado: { in: ['PENDING', 'OVERDUE', 'PARTIAL'] },
      fechaVencimiento: { lt: today },
    },
    orderBy: [
      { fechaVencimiento: 'asc' }, // oldest first
      { montoEsperado: 'desc' },
    ],
    include: {
      loan: {
        include: {
          client: { select: { nombreCompleto: true, telefono: true } },
        },
      },
    },
  })

  const totalEsperado = schedule.reduce((sum: number, s) => sum + Number(s.montoEsperado), 0)
  const isHabil = esDiaHabil(today)

  return (
    <div className="p-4 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Agenda de cobro</h1>
        <p className="text-sm text-muted-foreground">
          Pagos vencidos de días anteriores ·{' '}
          {formatDate(today, "EEEE d 'de' MMMM")} ·{' '}
          {isHabil ? 'Día hábil' : 'No hábil'}
        </p>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-red-50 rounded-lg p-3">
          <p className="text-xs text-red-600 font-medium">Por cobrar (vencido)</p>
          <p className="text-lg font-bold text-red-800 money">{formatMoney(totalEsperado)}</p>
        </div>
        <div className="bg-yellow-50 rounded-lg p-3">
          <p className="text-xs text-yellow-600 font-medium">Clientes con deuda</p>
          <p className="text-lg font-bold text-yellow-800">{schedule.length} clientes</p>
        </div>
      </div>

      {/* Lista de vencidos */}
      {schedule.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-red-600 mb-2">
            Pagos vencidos ({schedule.length})
          </h2>
          <div className="space-y-2">
            {schedule.map((s) => (
              <AgendaItem key={s.id} schedule={s} />
            ))}
          </div>
        </section>
      )}

      {schedule.length === 0 && (
        <div className="text-center py-12">
          <Calendar className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Sin pagos vencidos pendientes</p>
        </div>
      )}
    </div>
  )
}

function AgendaItem({
  schedule,
}: {
  schedule: {
    id: string
    numeroPago: number
    fechaVencimiento: Date
    montoEsperado: number | { toNumber: () => number }
    loan: {
      plazo: number
      tipo: string
      client: { nombreCompleto: string; telefono: string | null }
    }
  }
}) {
  const monto =
    typeof schedule.montoEsperado === 'number'
      ? schedule.montoEsperado
      : (schedule.montoEsperado as { toNumber: () => number }).toNumber()

  return (
    <Link href={`/cobros/capturar/${schedule.id}`}>
      <Card className="border-l-4 border-l-red-500">
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 truncate">
              {schedule.loan.client.nombreCompleto}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pago {schedule.numeroPago} de {schedule.loan.plazo} · {schedule.loan.tipo}
              {schedule.loan.client.telefono && ` · ${schedule.loan.client.telefono}`}
            </p>
            <p className="text-xs text-red-500 mt-0.5">
              Venció el {formatDate(schedule.fechaVencimiento, "d 'de' MMMM")}
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
