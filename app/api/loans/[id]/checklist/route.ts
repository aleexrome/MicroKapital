import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { companyId, rol } = session.user

  // Solo roles con acceso a detalles de préstamo pueden actualizar checklist
  const allowedRoles = ['GERENTE', 'COBRADOR', 'COORDINADOR', 'GERENTE_ZONAL', 'DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'SUPER_ADMIN']
  if (!allowedRoles.includes(rol)) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const loan = await prisma.loan.findFirst({
    where: { id: params.id, companyId: companyId! },
    select: { id: true },
  })
  if (!loan) return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })

  const body = await req.json()
  const { checklist } = body as { checklist: { id: string; label: string; checked: boolean }[] }

  if (!Array.isArray(checklist)) {
    return NextResponse.json({ error: 'Formato inválido' }, { status: 400 })
  }

  const updated = await prisma.loan.update({
    where: { id: params.id },
    data: { documentChecklist: checklist },
    select: { documentChecklist: true },
  })

  return NextResponse.json({ documentChecklist: updated.documentChecklist })
}
