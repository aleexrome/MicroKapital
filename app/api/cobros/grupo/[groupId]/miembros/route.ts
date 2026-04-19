import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

export async function GET(
  _req: NextRequest,
  { params }: { params: { groupId: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { companyId, rol, branchId, id: userId } = session.user
  const tienePermisoAplicar = session.user.permisoAplicarPagos === true

  // Alcance por rol — mismo criterio que en la página del préstamo y en /cobros/grupo.
  const loanScope: Prisma.LoanWhereInput = { estado: 'ACTIVE', companyId: companyId! }
  if (rol === 'COORDINADOR' || rol === 'COBRADOR') {
    loanScope.cobradorId = userId
  } else if (rol === 'GERENTE' || rol === 'GERENTE_ZONAL') {
    const zoneIds = session.user.zonaBranchIds?.length
      ? session.user.zonaBranchIds
      : branchId ? [branchId] : null
    if (zoneIds?.length) loanScope.branchId = { in: zoneIds }
  } else if (rol !== 'DIRECTOR_GENERAL' && rol !== 'SUPER_ADMIN') {
    if (!tienePermisoAplicar || !branchId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }
    loanScope.branchId = branchId
  }

  const grupo = await prisma.loanGroup.findFirst({
    where: {
      id: params.groupId,
      loans: { some: loanScope },
    },
    select: { id: true, nombre: true },
  })

  if (!grupo) return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 })

  // Préstamos activos del grupo dentro del alcance del usuario
  const loans = await prisma.loan.findMany({
    where: {
      loanGroupId: params.groupId,
      ...loanScope,
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
