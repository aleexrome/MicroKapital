import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, branchId, zonaBranchIds } = session.user

  const cobrador = await prisma.user.findFirst({
    where: { companyId: companyId!, email: session.user.email! },
    select: { id: true },
  })

  // Alcance por rol:
  //   COBRADOR / COORDINADOR → solo sus propios tickets (impresoPorId = userId)
  //   GERENTE / GERENTE_ZONAL → tickets de su sucursal o zona
  //   DIRECTOR_GENERAL / DIRECTOR_COMERCIAL / SUPER_ADMIN → toda la empresa
  //     (esta API solo se llama desde TicketsClientView para no-directores;
  //      directores tienen su propio render server-side en page.tsx)
  const where: Prisma.TicketWhereInput = { companyId: companyId! }

  if (rol === 'COBRADOR' || rol === 'COORDINADOR') {
    if (!cobrador) return NextResponse.json({ data: [] })
    where.impresoPorId = cobrador.id
  } else if (rol === 'GERENTE') {
    if (branchId) where.branchId = branchId
    else return NextResponse.json({ data: [] })
  } else if (rol === 'GERENTE_ZONAL') {
    const zoneIds = zonaBranchIds?.length ? zonaBranchIds : (branchId ? [branchId] : [])
    if (!zoneIds.length) return NextResponse.json({ data: [] })
    where.branchId = { in: zoneIds }
  }

  const tickets = await prisma.ticket.findMany({
    where,
    orderBy: { impresoAt: 'desc' },
    take: 100,
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
