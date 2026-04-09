import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { createAuditLog } from '@/lib/audit'

const schema = z.object({
  paymentId: z.string().uuid(),
})

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, id: userId } = session.user

  // Solo Gerente Zonal, Director General o Super Admin pueden verificar
  const rolesPermitidos = ['GERENTE_ZONAL', 'DIRECTOR_GENERAL', 'SUPER_ADMIN', 'GERENTE']
  if (!rolesPermitidos.includes(rol)) {
    return NextResponse.json({ error: 'Sin permisos para verificar transferencias' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const { paymentId } = parsed.data

  const payment = await prisma.payment.findFirst({
    where: {
      id: paymentId,
      metodoPago: 'TRANSFER',
      statusTransferencia: 'PENDIENTE',
      loan: { companyId: companyId! },
    },
  })

  if (!payment) {
    return NextResponse.json({ error: 'Pago no encontrado o ya verificado' }, { status: 404 })
  }

  const verificador = await prisma.user.findFirst({
    where: { companyId: companyId!, email: session.user.email! },
  })

  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      statusTransferencia: 'VERIFICADO',
      verificadoPorId: verificador?.id ?? userId,
      verificadoAt: new Date(),
    },
  })

  createAuditLog({
    userId,
    accion: 'VERIFY_TRANSFER',
    tabla: 'Payment',
    registroId: paymentId,
    valoresNuevos: { statusTransferencia: 'VERIFICADO' },
  })

  return NextResponse.json({ success: true })
}
