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

  const ticket = await prisma.ticket.findFirst({
    where: { id: params.id, companyId: companyId! },
    include: {
      payment: {
        include: {
          client: { select: { nombreCompleto: true } },
          cobrador: { select: { nombre: true } },
          cashBreakdown: true,
          schedule: { select: { numeroPago: true } },
          loan: {
            select: {
              id: true,
              tipo: true,
              plazo: true,
              company: { select: { nombre: true } },
              branch: { select: { nombre: true } },
            },
          },
        },
      },
      impresoPor: { select: { nombre: true } },
    },
  })

  if (!ticket) return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 })

  return NextResponse.json({ data: ticket })
}
