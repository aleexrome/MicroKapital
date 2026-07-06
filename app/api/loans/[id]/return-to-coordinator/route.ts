import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { crearNotificacion, getGerentesZonalesIds } from '@/lib/notifications'
import { z } from 'zod'

const returnSchema = z.object({
  notas: z.string().min(1, 'Redacta las observaciones para el coordinador').max(4000),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, id: userId } = session.user

  if (rol !== 'MESA_CONTROL' && rol !== 'SUPER_ADMIN') {
    return NextResponse.json(
      { error: 'Sin permisos — solo Mesa de Control puede regresar solicitudes' },
      { status: 403 }
    )
  }

  const loan = await prisma.loan.findFirst({
    where: { id: params.id, companyId: companyId! },
  })
  if (!loan) return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })
  if (loan.estado !== 'PENDING_REVIEW') {
    return NextResponse.json(
      { error: 'La solicitud no está en revisión — no puede regresarse' },
      { status: 400 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const parsed = returnSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  await prisma.loan.update({
    where: { id: loan.id },
    data: {
      estado: 'RETURNED_TO_COORDINATOR',
      revisadoPorId: userId,
      revisadoAt: new Date(),
      revisionNotasGenerales: parsed.data.notas,
    },
  })

  createAuditLog({
    userId,
    accion: 'MESA_CONTROL_RETURN',
    tabla: 'Loan',
    registroId: loan.id,
    valoresNuevos: {
      estado: 'RETURNED_TO_COORDINATOR',
      revisadoPorId: userId,
      notas: parsed.data.notas,
    },
  })

  // Notificar a la cobradora + GZ del branch.
  try {
    const [clienteRow, gerentes] = await Promise.all([
      prisma.client.findUnique({ where: { id: loan.clientId }, select: { nombreCompleto: true } }),
      getGerentesZonalesIds(prisma, companyId!, loan.branchId),
    ])
    const clienteNombre = clienteRow?.nombreCompleto ?? 'cliente'
    await crearNotificacion(prisma, {
      companyId: companyId!,
      destinatariosIds: [loan.cobradorId, ...gerentes],
      tipo: 'SOLICITUD_REGRESADA',
      nivel: 'IMPORTANTE',
      titulo: 'Solicitud regresada por Mesa de Control',
      mensaje: `${clienteNombre} — revisa las observaciones y vuelve a enviar la solicitud.`,
      loanId: loan.id,
      clientId: loan.clientId,
    })
  } catch (e) {
    console.error('[return-to-coordinator] notif failed:', e)
  }

  return NextResponse.json({ message: 'Solicitud regresada al coordinador' })
}
