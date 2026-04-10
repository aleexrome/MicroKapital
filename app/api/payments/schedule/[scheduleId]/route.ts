import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ scheduleId: string }> }
) {
  const { scheduleId } = await params
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { companyId } = session.user

  const schedule = await prisma.paymentSchedule.findFirst({
    where: {
      id: scheduleId,
      loan: { companyId: companyId! },
    },
    include: {
      loan: {
        include: {
          client: { select: { id: true, nombreCompleto: true, telefono: true } },
        },
      },
    },
  })

  if (!schedule) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  return NextResponse.json({ data: schedule })
}
