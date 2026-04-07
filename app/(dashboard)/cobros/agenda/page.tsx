import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { formatMoney, formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Calendar, ChevronRight } from 'lucide-react'
import { esDiaHabil } from '@/lib/business-days'

export default async function AgendaPage() {
  const session = await getSession()
  if (!session?.user) return null

  const { companyId, branchId } = session.user

  // Obtener ID del cobrador actual
  const cobrador = await prisma.user.findFirst({
    where: { companyId: companyId!, email: session.user.email! },
  })

  if (!cobrador) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  // Agenda: pagos vencidos + de hoy del cobrador
  const schedule = await prisma.paymentSchedule.findMany({
    where: {
      loan: {
        cobradorId: cobrador.id,
        estado: 'ACTIVE',
      },
      estado: { in: ['PENDING', 'OVERDUE', 'PARTIAL'] },
      fechaVencimiento: { lte: tomorrow },
    },
    orderBy: [
      { estado: 'asc' }, // OVERDUE primero alfabéticamente
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

  // Separar vencidos vs. de hoy
  const vencidos = schedule.filter(
    (s) => s.estado === 'OVERDUE' || s.fechaVencimiento < today
  )
  const dehoy = schedule.filter(
    (s) => s.estado !== 'OVERDUE' && s.fechaVencimiento >= today
  )

  const totalEsperado = schedule.reduce((sum, s) => sum + Number(s.montoEsperado), 0)
  const isHabil = esDiaHabil(today)

  return (
    <div className="p-4 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Pactados del Día</h1>
        <p className="text-sm text-muted-foreground">
          {formatDate(today, "EEEE d 'de' MMMM")} ·{' '}
          {isHabil ? 'Día hábil' : 'No hábil'}
        </p>
      </div>

      {/* Resumen del día */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-primary-50 rounded-lg p-3">
          <p className="text-xs text-primary-600 font-medium">Por cobrar</p>
          <p className="text-lg font-bold text-primary-800 money">{formatMoney(totalEsperado)}</p>
        </div>
        <div className="bg-yellow-50 rounded-lg p-3">
          <p className="text-xs text-yellow-600 font-medium">Cobros</p>
          <p className="text-lg font-bold text-yellow-800">{schedule.length} clientes</p>
        </div>
      </div>

      {/* Vencidos */}
      {vencidos.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-red-600 mb-2 flex items-center gap-1">
            🔴 Vencidos ({vencidos.length})
          </h2>
          <div className="space-y-2">
            {vencidos.map((s) => (
              <AgendaItem key={s.id} schedule={s} variant="overdue" />
            ))}
          </div>
        </section>
      )}

      {/* De hoy */}
      {dehoy.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-yellow-600 mb-2 flex items-center gap-1">
            🟡 Hoy ({dehoy.length})
          </h2>
          <div className="space-y-2">
            {dehoy.map((s) => (
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

function AgendaItem({
  schedule,
  variant,
}: {
  schedule: {
    id: string
    numeroPago: number
    montoEsperado: number | { toNumber: () => number }
    loan: {
      plazo: number
      tipo: string
      client: { nombreCompleto: string; telefono: string | null }
    }
  }
  variant: 'overdue' | 'today'
}) {
  const monto = typeof schedule.montoEsperado === 'number'
    ? schedule.montoEsperado
    : (schedule.montoEsperado as { toNumber: () => number }).toNumber()

  return (
    <Link href={`/cobros/capturar/${schedule.id}`}>
      <Card className={`border-l-4 ${variant === 'overdue' ? 'border-l-red-500' : 'border-l-yellow-400'}`}>
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 truncate">{schedule.loan.client.nombreCompleto}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pago {schedule.numeroPago} de {schedule.loan.plazo} ·{' '}
              {schedule.loan.tipo}
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
