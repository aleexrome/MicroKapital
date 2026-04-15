import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: userId, rol, companyId, branchId } = session.user

  // SUPER_ADMIN: todos; GERENTE: los de su sucursal;
  // COBRADOR: los que él mismo imprimió (dentro de su sucursal).
  const tickets = await prisma.ticket.findMany({
    where: {
      companyId: companyId!,
      ...((rol === 'GERENTE' || rol === 'COBRADOR') && branchId ? { branchId } : {}),
      ...(rol === 'COBRADOR' ? { impresoPorId: userId } : {}),
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
