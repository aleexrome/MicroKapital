import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { crearNotificacion, getMesaControlIds, getDirectoresIds } from '@/lib/notifications'

/**
 * Coordinador (o Gerente Zonal / Super Admin) reenvía una solicitud que
 * Mesa de Control regresó con observaciones. El coordinador ya editó lo
 * necesario en el cliente / documentos / capital vía sus endpoints; aquí
 * solo cambiamos el estado de vuelta a PENDING_REVIEW y limpiamos las
 * observaciones abiertas para dejar la revisión de Mesa de Control en
 * blanco (revisionNotasGenerales, revisionNota de cada documento).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, id: userId } = session.user

  const rolesPermitidos = ['COORDINADOR', 'GERENTE_ZONAL', 'SUPER_ADMIN']
  if (!rolesPermitidos.includes(rol)) {
    return NextResponse.json({ error: 'Sin permisos para reenviar la solicitud' }, { status: 403 })
  }

  const loan = await prisma.loan.findFirst({
    where: { id: params.id, companyId: companyId! },
  })
  if (!loan) return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })

  if (loan.estado !== 'RETURNED_TO_COORDINATOR') {
    return NextResponse.json(
      { error: 'La solicitud no está regresada — no puede reenviarse' },
      { status: 400 }
    )
  }
  // El COORDINADOR solo puede reenviar SUS solicitudes. GZ y SUPER_ADMIN sí.
  if (rol === 'COORDINADOR' && loan.cobradorId !== userId) {
    return NextResponse.json({ error: 'Solo el coordinador que originó la solicitud puede reenviarla' }, { status: 403 })
  }

  await prisma.$transaction(async (tx) => {
    await tx.loan.update({
      where: { id: loan.id },
      data: {
        estado: 'PENDING_REVIEW',
        // Limpiamos la revisión anterior para no confundir al Mesa de Control:
        // el ciclo de revisión arranca en cero.
        revisionNotasGenerales: null,
        revisadoPorId: null,
        revisadoAt: null,
      },
    })

    await tx.loanDocument.updateMany({
      where: { loanId: loan.id, revisionNota: { not: null } },
      data: { revisionNota: null, revisadoAt: null },
    })

    // Las notas de documentos del expediente del cliente son globales al
    // cliente, no al préstamo. Aun así conviene limpiar las que Mesa de
    // Control levantó para ESTE cliente en esta revisión — un reenvío
    // significa que el coordinador ya las atendió.
    await tx.clientDocument.updateMany({
      where: { clientId: loan.clientId, revisionNota: { not: null } },
      data: { revisionNota: null, revisadoAt: null },
    })
  })

  createAuditLog({
    userId,
    accion: 'RESUBMIT_LOAN',
    tabla: 'Loan',
    registroId: loan.id,
    valoresNuevos: { estado: 'PENDING_REVIEW' },
  })

  // Notificar a Mesa de Control (fallback DG si no hay).
  try {
    const [clienteRow, mesaControl] = await Promise.all([
      prisma.client.findUnique({ where: { id: loan.clientId }, select: { nombreCompleto: true } }),
      getMesaControlIds(prisma, companyId!),
    ])
    const clienteNombre = clienteRow?.nombreCompleto ?? 'cliente'
    const destinatarios = mesaControl.length
      ? mesaControl
      : await getDirectoresIds(prisma, companyId!)
    await crearNotificacion(prisma, {
      companyId: companyId!,
      destinatariosIds: destinatarios,
      tipo: 'SOLICITUD_REENVIADA',
      nivel: 'IMPORTANTE',
      titulo: 'Solicitud reenviada por coordinador',
      mensaje: `${clienteNombre} — el coordinador subsanó las observaciones y la solicitud vuelve a revisión.`,
      loanId: loan.id,
      clientId: loan.clientId,
    })
  } catch (e) {
    console.error('[resubmit] notif failed:', e)
  }

  return NextResponse.json({ message: 'Solicitud reenviada a Mesa de Control' })
}
