import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { z } from 'zod'

const patchSchema = z.object({
  metodoPago: z.enum(['CASH', 'CARD', 'TRANSFER']),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getSession()
  if (!session?.user || session.user.rol !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Método de pago inválido' }, { status: 400 })

  const payment = await prisma.payment.findUnique({
    where: { id },
    include: { loan: { select: { companyId: true } } },
  })
  if (!payment) return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })

  const prev = payment.metodoPago

  await prisma.payment.update({
    where: { id },
    data: { metodoPago: parsed.data.metodoPago },
  })

  createAuditLog({
    userId: session.user.id,
    accion: 'ADMIN_UPDATE_PAYMENT_METHOD',
    tabla: 'Payment',
    registroId: id,
    valoresAnteriores: { metodoPago: prev },
    valoresNuevos: { metodoPago: parsed.data.metodoPago },
  })

  return NextResponse.json({ message: 'Método de pago actualizado' })
}
