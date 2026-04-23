import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, branchId } = session.user

  const cobrador = await prisma.user.findFirst({
    where: { companyId: companyId!, email: session.user.email! },
  })

  const tickets = await prisma.ticket.findMany({
    where: {
      companyId: companyId!,
      ...(rol === 'COBRADOR' && cobrador ? { impresoPorId: cobrador.id } : {}),
      ...(rol === 'COBRADOR' && branchId ? { branchId } : {}),
    },
    orderBy: { impresoAt: 'desc' },
    take: 50,
    include: {
      payment: {
        include: {
          client: { select: { nombreCompleto: true } },
        },
      },
      impresoPor: { select: { nombre: true } },
    },
  })

  return NextResponse.json({ data: tickets })
}
