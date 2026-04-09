import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: NextRequest,
  { params }: { params: { groupId: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { companyId, id: userId } = session.user

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const grupo = await prisma.loanGroup.findFirst({
    where: {
      id: params.groupId,
      loans: { some: { companyId: companyId!, cobradorId: userId } },
    },
    select: { id: true, nombre: true },
  })

  if (!grupo) return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 })

  // Préstamos activos del grupo para este cobrador
  const loans = await prisma.loan.findMany({
    where: {
      loanGroupId: params.groupId,
      estado:      'ACTIVE',
      companyId:   companyId!,
      cobradorId:  userId,
    },
    include: {
      client: { select: { id: true, nombreCompleto: true } },
      schedule: {
        where: { estado: { in: ['PENDING', 'OVERDUE', 'PARTIAL'] } },
        orderBy: { numeroPago: 'asc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  const data = loans
    .filter((l) => l.schedule.length > 0)
    .map((l) => {
      const sched = l.schedule[0]!
      return {
        scheduleId:   sched.id,
        loanId:       l.id,
        clientId:     l.client.id,
        clientNombre: l.client.nombreCompleto,
        numeroPago:   sched.numeroPago,
        totalPagos:   l.plazo,
        monto:        Number(sched.montoEsperado),
        estadoActual: sched.estado,
      }
    })

  return NextResponse.json({ data, grupoNombre: grupo.nombre })
}
