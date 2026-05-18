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
    select: {
      id: true, estado: true, cobradorId: true, branchId: true,
      tipo: true, loanGroupId: true, loanOriginalId: true, esCoordinadora: true,
    },
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

  // ── SOLIDARIO grupal ─────────────────────────────────────────────────────
  // Si es integrante no-coordinador, rechazar — el flujo arranca desde la
  // coordinadora del grupo. Si es coordinadora, transicionar TODOS los
  // integrantes APPROVED del mismo ciclo en una sola transacción.
  let loanIdsToStart: string[] = [loan.id]
  let inicioGrupal = false

  if (loan.tipo === 'SOLIDARIO' && loan.loanGroupId) {
    const esRenovacion = loan.loanOriginalId !== null
    const cicloFilter = esRenovacion
      ? { loanOriginalId: { not: null } }
      : { loanOriginalId: null }

    if (loan.esCoordinadora) {
      const integrantes = await prisma.loan.findMany({
        where: {
          loanGroupId: loan.loanGroupId,
          estado: 'APPROVED',
          ...cicloFilter,
          companyId: companyId!,
        },
        select: { id: true },
      })
      if (integrantes.length > 0) {
        loanIdsToStart = integrantes.map((i) => i.id)
        inicioGrupal = integrantes.length > 1
      }
    } else {
      const coord = await prisma.loan.findFirst({
        where: {
          loanGroupId: loan.loanGroupId,
          esCoordinadora: true,
          ...cicloFilter,
          companyId: companyId!,
        },
        include: { client: { select: { nombreCompleto: true } } },
      })
      if (coord) {
        return NextResponse.json(
          {
            error: 'INICIAR_DESDE_COORDINADORA',
            message: `La activación grupal arranca desde el perfil de la coordinadora: ${coord.client.nombreCompleto}.`,
            coordinadoraLoanId: coord.id,
            coordinadoraNombre: coord.client.nombreCompleto,
          },
          { status: 400 }
        )
      }
    }
  }

  const startedAt = new Date()
  await prisma.loan.updateMany({
    where: { id: { in: loanIdsToStart } },
    data: {
      estado: 'IN_ACTIVATION',
      activationStartedAt: startedAt,
      activationCanceledAt: null,
      activationCanceledBy: null,
      activationCancelReason: null,
    },
  })

  createAuditLog({
    userId,
    accion: inicioGrupal ? 'START_GROUP_ACTIVATION' : 'START_ACTIVATION',
    tabla: 'Loan',
    registroId: loan.id,
    valoresNuevos: {
      estado: 'IN_ACTIVATION',
      ...(inicioGrupal ? { integrantesIniciados: loanIdsToStart } : {}),
    },
  })

  return NextResponse.json({
    message: inicioGrupal
      ? `Activación iniciada para ${loanIdsToStart.length} integrantes del grupo`
      : 'Activación iniciada',
  })
}
