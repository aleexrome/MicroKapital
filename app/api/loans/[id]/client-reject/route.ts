import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { type Prisma } from '@prisma/client'
import { hardDeleteLoan } from '@/lib/hard-delete-loan'

/**
 * Registra el rechazo del cliente ANTES de que se active el crédito
 * (estado APPROVED). Antes se marcaba REJECTED con razón; ahora se
 * hard-deletea todo el préstamo — solicitud, documentos, aprobación —
 * porque el negocio decidió que las rechazadas no deben guardarse.
 *
 * Para SOLIDARIO se propaga a todo el grupo del mismo ciclo (incluye
 * IN_ACTIVATION porque pudo haberse arrancado en la coordinadora).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, branchId, id: userId } = session.user

  const rolesPermitidos = ['COORDINADOR', 'COBRADOR', 'GERENTE', 'GERENTE_ZONAL', 'SUPER_ADMIN']
  if (!rolesPermitidos.includes(rol)) {
    return NextResponse.json({ error: 'Sin permisos para registrar rechazo del cliente' }, { status: 403 })
  }

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
  // borrarse. Incluimos APPROVED y IN_ACTIVATION (mismo criterio que antes).
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

  await prisma.$transaction(async (tx) => {
    for (const id of loanIdsARechazar) {
      await hardDeleteLoan(tx, id)
    }
  })

  return NextResponse.json({
    message: rechazoGrupal
      ? `Crédito grupal cancelado y eliminado — el cliente no aceptó las condiciones (${loanIdsARechazar.length} integrantes)`
      : 'Crédito cancelado y eliminado — el cliente no aceptó las condiciones',
  })
}
