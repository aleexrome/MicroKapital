import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { hardDeleteLoan } from '@/lib/hard-delete-loan'
import { crearNotificacion, getMesaControlIds, getDirectoresIds } from '@/lib/notifications'

/**
 * POST /api/loans/[id]/cancel-returned
 *
 * El coordinador/gerente puede cancelar (eliminar por completo) una
 * solicitud que Mesa de Control le regresó para corregir, cuando el
 * cliente desistió / se aburrió y ya no quiere continuar.
 *
 * Reglas:
 *   • Solo loans en estado RETURNED_TO_COORDINATOR
 *   • Solo el cobrador del loan, gerente de la sucursal, GZ de la zona
 *     o SUPER_ADMIN pueden cancelar
 *   • Hard delete porque la solicitud nunca fue aprobada ni activada
 *     (no hay dinero movido ni cliente firmando algo)
 *   • Notifica a Mesa de Control para que vea que el expediente no va
 *     a volver (y pueda limpiar su bandeja)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: userId, rol, companyId, branchId: userBranchId, zonaBranchIds } = session.user

  const body = await req.json().catch(() => ({}))
  const motivo = typeof body.motivo === 'string' ? body.motivo.trim() : ''
  if (motivo.length < 3) {
    return NextResponse.json({ error: 'Motivo requerido (ej. "El cliente desistió")' }, { status: 400 })
  }

  const loan = await prisma.loan.findFirst({
    where: { id: params.id, companyId: companyId! },
    include: { client: { select: { nombreCompleto: true } } },
  })
  if (!loan) return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })

  if (loan.estado !== 'RETURNED_TO_COORDINATOR') {
    return NextResponse.json({
      error: `Solo se puede cancelar solicitudes regresadas al coordinador. Esta está en ${loan.estado}.`,
    }, { status: 400 })
  }

  // Permisos: cobrador del loan, gerente de la sucursal, GZ de la zona o SA
  const esCobrador = loan.cobradorId === userId
  const esGerenteSucursal = rol === 'GERENTE' && userBranchId === loan.branchId
  const esGZDeZona = rol === 'GERENTE_ZONAL'
    && Array.isArray(zonaBranchIds)
    && zonaBranchIds.includes(loan.branchId)
  const esSA = rol === 'SUPER_ADMIN'
  if (!(esCobrador || esGerenteSucursal || esGZDeZona || esSA)) {
    return NextResponse.json({
      error: 'Solo el coordinador del préstamo, gerente de la sucursal, GZ o SUPER_ADMIN puede cancelar la solicitud.',
    }, { status: 403 })
  }

  // Snapshot para la auditoría ANTES del hard-delete
  const snapshot = {
    tipo:        loan.tipo,
    capital:     Number(loan.capital),
    estado:      loan.estado,
    cobradorId:  loan.cobradorId,
    clientNombre: loan.client.nombreCompleto,
    branchId:    loan.branchId,
    motivo,
    canceladoPorId: userId,
    canceladoPorRol: rol,
  }

  await prisma.$transaction(async (tx) => {
    await hardDeleteLoan(tx, loan.id)
  })

  createAuditLog({
    userId,
    accion: 'CANCEL_RETURNED_LOAN',
    tabla: 'Loan',
    registroId: loan.id,
    valoresAnteriores: snapshot,
  })

  // Notificar a Mesa de Control + Dirección (fallback) para que limpien
  // su bandeja. No bloqueamos el request si falla.
  try {
    const [mesaControl, directores] = await Promise.all([
      getMesaControlIds(prisma, companyId!),
      getDirectoresIds(prisma, companyId!),
    ])
    const destinatarios = mesaControl.length ? mesaControl : directores
    if (destinatarios.length > 0) {
      await crearNotificacion(prisma, {
        companyId: companyId!,
        destinatariosIds: destinatarios,
        tipo:  'SOLICITUD_CANCELADA',
        nivel: 'INFORMATIVA',
        titulo: 'Solicitud cancelada por coordinador',
        mensaje: `${loan.client.nombreCompleto}: ${motivo}`,
      })
    }
  } catch (e) {
    console.error('[cancel-returned] notif failed:', e)
  }

  return NextResponse.json({ ok: true })
}
