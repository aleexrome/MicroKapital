import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'

/**
 * POST /api/loans/[id]/start-activation
 *
 * Mueve el préstamo de APPROVED → IN_ACTIVATION.
 * Es el botón "Comenzar activación" que el coordinador presiona después
 * de visitar al cliente y obtener su aceptación de las condiciones.
 *
 * A partir de IN_ACTIVATION arranca el flujo de los 3 candados (contrato
 * firmado, pago de comisión, foto de desembolso con GPS).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { rol, companyId, id: userId, zonaBranchIds } = session.user

  const loan = await prisma.loan.findFirst({
    where: { id: params.id, companyId: companyId! },
    select: { id: true, estado: true, cobradorId: true, branchId: true },
  })
  if (!loan) {
    return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })
  }

  // Permisos: SUPER_ADMIN, DIRECTOR_GENERAL, o COORDINADOR/GERENTE_ZONAL del préstamo
  let allowed = false
  if (rol === 'SUPER_ADMIN' || rol === 'DIRECTOR_GENERAL') {
    allowed = true
  } else if (rol === 'COORDINADOR' || rol === 'GERENTE') {
    allowed = loan.cobradorId === userId
  } else if (rol === 'GERENTE_ZONAL') {
    const zoneIds = Array.isArray(zonaBranchIds) ? zonaBranchIds : []
    allowed = zoneIds.includes(loan.branchId) || loan.cobradorId === userId
  }
  if (!allowed) {
    return NextResponse.json({ error: 'Sin permisos para iniciar la activación' }, { status: 403 })
  }

  if (loan.estado !== 'APPROVED') {
    return NextResponse.json(
      { error: 'El préstamo debe estar en estado APPROVED para iniciar la activación' },
      { status: 400 }
    )
  }

  await prisma.loan.update({
    where: { id: loan.id },
    data: {
      estado: 'IN_ACTIVATION',
      activationStartedAt: new Date(),
      // Si había una cancelación previa (DECLINED → APPROVED → IN_ACTIVATION), limpiar
      activationCanceledAt: null,
      activationCanceledBy: null,
      activationCancelReason: null,
    },
  })

  createAuditLog({
    userId,
    accion: 'START_ACTIVATION',
    tabla: 'Loan',
    registroId: loan.id,
    valoresNuevos: { estado: 'IN_ACTIVATION' },
  })

  return NextResponse.json({ message: 'Activación iniciada' })
}
