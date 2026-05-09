import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { notificarCancelacionLimbo } from '@/lib/limbo-notifications'

/**
 * POST /api/loans/[id]/cancel-start-activation
 *
 * "Volver atrás" — deshace la transición APPROVED → IN_ACTIVATION cuando
 * la coordinadora aún no ha cumplido ningún candado. El préstamo regresa
 * a APPROVED, listo para reintentarse cuando el cliente esté listo.
 *
 * Reglas:
 *   - Préstamo en IN_ACTIVATION
 *   - Cero progreso: sin Contract.loanDocumentFirmadoId, sin Payment
 *     vigente de comisión, sin desembolsoFotoUrl
 *   - Si ya hay avance, devuelve 400 indicando que use "Cancelar
 *     activación" (que va a DECLINED con razón obligatoria)
 *
 * Permisos: SUPER_ADMIN, COBRADOR del préstamo, GERENTE_ZONAL del branch.
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
      id: true, estado: true, cobradorId: true, branchId: true, companyId: true,
      desembolsoFotoUrl: true, capital: true,
      client: { select: { nombreCompleto: true } },
    },
  })
  if (!loan) {
    return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })
  }

  // Permisos
  let allowed = false
  if (rol === 'SUPER_ADMIN') {
    allowed = true
  } else if (rol === 'COORDINADOR' || rol === 'GERENTE') {
    allowed = loan.cobradorId === userId
  } else if (rol === 'GERENTE_ZONAL') {
    const zoneIds = Array.isArray(zonaBranchIds) ? zonaBranchIds : []
    allowed = zoneIds.includes(loan.branchId) || loan.cobradorId === userId
  }
  if (!allowed) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  if (loan.estado !== 'IN_ACTIVATION') {
    return NextResponse.json(
      { error: 'El préstamo no está en activación' },
      { status: 400 }
    )
  }

  // ── Verificar que NO haya progreso en ningún candado ──────────────────────
  if (loan.desembolsoFotoUrl) {
    return NextResponse.json(
      { error: 'Ya hay avance en la activación (foto de desembolso). Usa "Cancelar activación" para deshacer todo.' },
      { status: 400 }
    )
  }

  const contractFirmado = await prisma.contract.count({
    where: {
      companyId: companyId!,
      loanDocumentFirmadoId: { not: null },
      OR: [
        { loanId: loan.id },
        { groupMembers: { some: { loanId: loan.id } } },
      ],
    },
  })
  if (contractFirmado > 0) {
    return NextResponse.json(
      { error: 'Ya hay avance en la activación (contrato firmado subido). Usa "Cancelar activación" para deshacer todo.' },
      { status: 400 }
    )
  }

  const paymentVigente = await prisma.payment.count({
    where: {
      loanId: loan.id,
      scheduleId: null,
      canceledAt: null,
      OR: [
        { notas: { contains: 'apertura', mode: 'insensitive' } },
        { notas: { contains: 'seguro',   mode: 'insensitive' } },
        { notas: { contains: 'comisi',   mode: 'insensitive' } },
      ],
    },
  })
  if (paymentVigente > 0) {
    return NextResponse.json(
      { error: 'Ya hay avance en la activación (pago de comisión registrado). Usa "Cancelar activación" para deshacer todo.' },
      { status: 400 }
    )
  }

  // ── Regresar a APPROVED ───────────────────────────────────────────────────
  await prisma.loan.update({
    where: { id: loan.id },
    data: {
      estado: 'APPROVED',
      activationStartedAt: null,
    },
  })

  createAuditLog({
    userId,
    accion: 'CANCEL_START_ACTIVATION',
    tabla: 'Loan',
    registroId: loan.id,
    valoresNuevos: { estado: 'APPROVED', motivo: 'Volver atrás antes de avance' },
  })

  // Notificar a cobradora + GZ + DG/DC. Best-effort.
  try {
    await notificarCancelacionLimbo(prisma, {
      loan,
      motivo: 'Volver atrás antes de avance',
      canceladoPorUserId: userId,
      accion: 'CANCEL_START_ACTIVATION',
    })
  } catch (e) {
    console.error('[cancel-start-activation] notificarCancelacionLimbo failed:', e)
  }

  return NextResponse.json({ ok: true, message: 'Activación deshecha — préstamo regresó a aprobado' })
}
