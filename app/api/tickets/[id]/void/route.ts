import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { z } from 'zod'

const voidSchema = z.object({
  razonAnulacion: z.string().min(5, 'Razón de anulación requerida'),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, id: userId } = session.user

  // Solo GERENTE o SUPER_ADMIN pueden anular
  if (rol !== 'GERENTE' && rol !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = voidSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const ticket = await prisma.ticket.findFirst({
    where: { id: params.id, companyId: companyId! },
  })

  if (!ticket) return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 })
  if (ticket.anulado) return NextResponse.json({ error: 'Ticket ya está anulado' }, { status: 400 })

  // Los tickets son inmutables: marcar como anulado pero no eliminar
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      anulado: true,
      razonAnulacion: parsed.data.razonAnulacion,
    },
  })

  createAuditLog({
    userId,
    accion: 'VOID_TICKET',
    tabla: 'Ticket',
    registroId: ticket.id,
    valoresAnteriores: { anulado: false },
    valoresNuevos: { anulado: true, razonAnulacion: parsed.data.razonAnulacion },
  })

  return NextResponse.json({ message: 'Ticket anulado correctamente' })
}
