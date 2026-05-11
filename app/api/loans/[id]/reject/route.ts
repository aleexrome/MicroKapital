import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { crearNotificacion, getGerentesZonalesIds } from '@/lib/notifications'
import { z } from 'zod'

const rejectSchema = z.object({
  razonRechazo: z.string().min(5, 'Razón de rechazo requerida'),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, id: userId } = session.user

  if (rol !== 'DIRECTOR_GENERAL' && rol !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Sin permisos — solo el Director General puede rechazar créditos' }, { status: 403 })
  }

  const loan = await prisma.loan.findFirst({
    where: { id: params.id, companyId: companyId! },
  })

  if (!loan) return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })
  if (loan.estado !== 'PENDING_APPROVAL') {
    return NextResponse.json({ error: 'El préstamo no está pendiente' }, { status: 400 })
  }

  const body = await req.json()
  const parsed = rejectSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  await prisma.$transaction(async (tx) => {
    await tx.loan.update({
      where: { id: loan.id },
      data: {
        estado: 'REJECTED',
        rechazadoPorId: userId,
        razonRechazo: parsed.data.razonRechazo,
      },
    })

    await tx.loanApproval.updateMany({
      where: { loanId: loan.id, estado: 'PENDING' },
      data: {
        estado: 'REJECTED',
        revisadoPorId: userId,
        revisadoAt: new Date(),
        notas: parsed.data.razonRechazo,
      },
    })
  })

  createAuditLog({
    userId,
    accion: 'REJECT_LOAN',
    tabla: 'Loan',
    registroId: loan.id,
    valoresNuevos: { estado: 'REJECTED', razonRechazo: parsed.data.razonRechazo },
  })

  // Notificar a la cobradora + GZ del branch que la solicitud fue rechazada.
  try {
    const [clienteRow, gerentes] = await Promise.all([
      prisma.client.findUnique({ where: { id: loan.clientId }, select: { nombreCompleto: true } }),
      getGerentesZonalesIds(prisma, companyId!, loan.branchId),
    ])
    const clienteNombre = clienteRow?.nombreCompleto ?? 'cliente'
    await crearNotificacion(prisma, {
      companyId: companyId!,
      destinatariosIds: [loan.cobradorId, ...gerentes],
      tipo: 'SOLICITUD_RECHAZADA',
      nivel: 'IMPORTANTE',
      titulo: 'Solicitud rechazada',
      mensaje: `${clienteNombre} — rechazada por el Director General. Motivo: ${parsed.data.razonRechazo}`,
      loanId: loan.id,
      clientId: loan.clientId,
    })
  } catch (e) {
    console.error('[reject] notif failed:', e)
  }

  return NextResponse.json({ message: 'Préstamo rechazado' })
}
