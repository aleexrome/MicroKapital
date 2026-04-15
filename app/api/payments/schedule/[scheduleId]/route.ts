import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { branchScope } from '@/lib/access'

export async function GET(
  req: NextRequest,
  { params }: { params: { scheduleId: string } }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { companyId } = session.user

  const schedule = await prisma.paymentSchedule.findFirst({
    where: {
      id: params.scheduleId,
      loan: { companyId: companyId!, ...branchScope(session.user) },
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
