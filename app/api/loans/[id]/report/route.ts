import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { companyId } = session.user

  const loan = await prisma.loan.findFirst({
    where: { id: params.id, companyId: companyId!, estado: 'LIQUIDATED' },
    include: {
      client: { select: { nombreCompleto: true, telefono: true, domicilio: true } },
      cobrador: { select: { nombre: true } },
      branch: { select: { nombre: true } },
      company: { select: { nombre: true } },
      schedule: { orderBy: { numeroPago: 'asc' } },
      payments: {
        orderBy: { fechaHora: 'asc' },
        include: {
          tickets: { where: { esReimpresion: false }, take: 1, select: { numeroTicket: true } },
        },
      },
    },
  })

  if (!loan) return NextResponse.json({ error: 'Crédito no encontrado' }, { status: 404 })

  return NextResponse.json({ data: loan })
}
