import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { type Prisma } from '@prisma/client'
import { createAuditLog } from '@/lib/audit'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, branchId, id: userId } = session.user

  // Mismos roles que pueden activar un crédito aprobado (ver prestamos/[id] — puedeActivar).
  const rolesPermitidos = ['COORDINADOR', 'COBRADOR', 'GERENTE', 'GERENTE_ZONAL', 'SUPER_ADMIN']
  if (!rolesPermitidos.includes(rol)) {
    return NextResponse.json({ error: 'Sin permisos para registrar rechazo del cliente' }, { status: 403 })
  }

  // Alcance del préstamo por rol — consistente con la UI de detalle.
  const rejectWhere: Prisma.LoanWhereInput = { id: params.id, companyId: companyId! }
  if (rol === 'COORDINADOR' || rol === 'COBRADOR') {
    rejectWhere.cobradorId = userId
  } else if (rol === 'GERENTE' || rol === 'GERENTE_ZONAL') {
    const zonas = session.user.zonaBranchIds?.length
      ? session.user.zonaBranchIds
      : branchId ? [branchId] : null
    if (zonas?.length) rejectWhere.branchId = { in: zonas }
  }

  const loan = await prisma.loan.findFirst({
    where: rejectWhere,
  })

  if (!loan) return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })
  if (loan.estado !== 'APPROVED') {
    return NextResponse.json({ error: 'Solo se puede rechazar un crédito en estado Aprobado' }, { status: 400 })
  }

  await prisma.loan.update({
    where: { id: loan.id },
    data: {
      estado: 'REJECTED',
      razonRechazo: 'Cliente no aceptó las condiciones ofrecidas',
    },
  })

  createAuditLog({
    userId,
    accion: 'CLIENT_REJECT_LOAN',
    tabla: 'Loan',
    registroId: loan.id,
    valoresNuevos: {
      estado: 'REJECTED',
      razonRechazo: 'Cliente no aceptó las condiciones ofrecidas',
      registradoPorId: userId,
    },
  })

  return NextResponse.json({ message: 'Crédito cancelado — el cliente no aceptó las condiciones' })
}
