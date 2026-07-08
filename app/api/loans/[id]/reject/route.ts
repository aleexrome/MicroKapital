import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { crearNotificacion, getGerentesZonalesIds } from '@/lib/notifications'
import { hardDeleteLoan } from '@/lib/hard-delete-loan'
import { z } from 'zod'

const rejectSchema = z.object({
  razonRechazo: z.string().min(5, 'Razón de rechazo requerida'),
})

/**
 * DG rechaza una solicitud PENDING_APPROVAL. Antes se guardaba con estado
 * REJECTED como historial, pero solo era basura en el sistema; ahora se
 * borra por completo. Se notifica a la cobradora + GZ antes del delete
 * porque después no queda ni el loanId para navegar.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId } = session.user

  if (rol !== 'DIRECTOR_GENERAL' && rol !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Sin permisos — solo el Director General puede rechazar créditos' }, { status: 403 })
  }

  const loan = await prisma.loan.findFirst({
    where: { id: params.id, companyId: companyId! },
    include: {
      client: { select: { id: true, nombreCompleto: true } },
    },
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

  // Snapshot para la notificación — después del delete ya no hay loanId.
  const clienteNombre = loan.client.nombreCompleto
  const clientId = loan.clientId
  const cobradorId = loan.cobradorId
  const branchId = loan.branchId

  // Notificar ANTES del borrado — el hilo del payload puede referenciar
  // loanId (útil si algún viewer lo abriera antes del delete), pero
  // sobre todo garantiza que el aviso llegue aunque el delete falle.
  try {
    const gerentes = await getGerentesZonalesIds(prisma, companyId!, branchId)
    await crearNotificacion(prisma, {
      companyId: companyId!,
      destinatariosIds: [cobradorId, ...gerentes],
      tipo: 'SOLICITUD_RECHAZADA',
      nivel: 'IMPORTANTE',
      titulo: 'Solicitud rechazada',
      mensaje: `${clienteNombre} — rechazada por el Director General. Motivo: ${parsed.data.razonRechazo}`,
      clientId,
    })
  } catch (e) {
    console.error('[reject] notif failed:', e)
  }

  await prisma.$transaction(async (tx) => {
    await hardDeleteLoan(tx, loan.id)
  })

  return NextResponse.json({ message: 'Préstamo rechazado y eliminado del historial' })
}
