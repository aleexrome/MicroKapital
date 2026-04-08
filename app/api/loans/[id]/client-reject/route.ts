import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, id: userId } = session.user

  const rolesPermitidos = ['COORDINADOR', 'GERENTE_ZONAL', 'GERENTE', 'SUPER_ADMIN']
  if (!rolesPermitidos.includes(rol)) {
    return NextResponse.json({ error: 'Sin permisos para registrar rechazo del cliente' }, { status: 403 })
  }

  const loan = await prisma.loan.findFirst({
    where: { id: params.id, companyId: companyId! },
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
