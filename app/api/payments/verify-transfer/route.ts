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

  // Solo Gerente Zonal/Gerente y Super Admin pueden verificar transferencias
  // Los directores y coordinadores NO pueden aprobar
  const rolesPermitidos = ['GERENTE_ZONAL', 'GERENTE', 'SUPER_ADMIN']
  if (!rolesPermitidos.includes(rol)) {
    return NextResponse.json({ error: 'Sin permisos — solo el Gerente y el Super Admin pueden verificar transferencias' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const { paymentId } = parsed.data

  // Scope de sucursal — gerente solo puede verificar pagos de su sucursal
  const branchScope: Record<string, unknown> = {}
  if (rol === 'GERENTE' || rol === 'GERENTE_ZONAL') {
    const branchIds = session.user.zonaBranchIds?.length
      ? session.user.zonaBranchIds
      : session.user.branchId ? [session.user.branchId] : null
    if (branchIds?.length) branchScope.branchId = { in: branchIds }
  }

  const payment = await prisma.payment.findFirst({
    where: {
      id: paymentId,
      metodoPago: 'TRANSFER',
      statusTransferencia: 'PENDIENTE',
      loan: { companyId: companyId!, ...branchScope },
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
