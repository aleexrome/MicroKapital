import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { type Prisma } from '@prisma/client'
import { createAuditLog } from '@/lib/audit'

const RAZON_RECHAZO = 'Cliente no aceptó las condiciones ofrecidas'

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
    select: {
      id: true, estado: true, tipo: true, loanGroupId: true, loanOriginalId: true,
    },
  })

  if (!loan) return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })
  if (loan.estado !== 'APPROVED') {
    return NextResponse.json({ error: 'Solo se puede rechazar un crédito en estado Aprobado' }, { status: 400 })
  }

  // ── SOLIDARIO grupal ─────────────────────────────────────────────────────
  // Si el cliente del grupo rechaza, todo el grupo del mismo ciclo debe
  // quedar cancelado. La búsqueda incluye APPROVED y IN_ACTIVATION porque
  // pudo haberse iniciado activación y luego usado "Volver atrás" solo en
  // la coordinadora — las demás integrantes se quedan en IN_ACTIVATION y,
  // sin esta propagación, caen en limbo. El filtro de ciclo es el mismo
  // que start-activation: original vs renovación se distinguen por
  // loanOriginalId.
  let loanIdsARechazar: string[] = [loan.id]
  let rechazoGrupal = false

  if (loan.tipo === 'SOLIDARIO' && loan.loanGroupId) {
    const esRenovacion = loan.loanOriginalId !== null
    const cicloFilter: Prisma.LoanWhereInput = esRenovacion
      ? { loanOriginalId: { not: null } }
      : { loanOriginalId: null }

    const integrantes = await prisma.loan.findMany({
      where: {
        loanGroupId: loan.loanGroupId,
        estado: { in: ['APPROVED', 'IN_ACTIVATION'] },
        companyId: companyId!,
        ...cicloFilter,
      },
      select: { id: true },
    })
    if (integrantes.length > 0) {
      loanIdsARechazar = integrantes.map((i) => i.id)
      rechazoGrupal = integrantes.length > 1
    }
  }

  await prisma.loan.updateMany({
    where: { id: { in: loanIdsARechazar } },
    data: {
      estado: 'REJECTED',
      razonRechazo: RAZON_RECHAZO,
    },
  })

  createAuditLog({
    userId,
    accion: rechazoGrupal ? 'CLIENT_REJECT_GROUP' : 'CLIENT_REJECT_LOAN',
    tabla: 'Loan',
    registroId: loan.id,
    valoresNuevos: {
      estado: 'REJECTED',
      razonRechazo: RAZON_RECHAZO,
      registradoPorId: userId,
      ...(rechazoGrupal ? { integrantesRechazados: loanIdsARechazar } : {}),
    },
  })

  return NextResponse.json({
    message: rechazoGrupal
      ? `Crédito grupal cancelado — el cliente no aceptó las condiciones (${loanIdsARechazar.length} integrantes)`
      : 'Crédito cancelado — el cliente no aceptó las condiciones',
  })
}
