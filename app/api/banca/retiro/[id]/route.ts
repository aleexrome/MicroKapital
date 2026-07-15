import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

/**
 * Borra un retiro capturado. Uso típico: DG se equivocó al capturar
 * y quiere deshacer. Solo DG / DC / SUPER_ADMIN.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId } = session.user
  if (rol !== 'DIRECTOR_GENERAL' && rol !== 'DIRECTOR_COMERCIAL' && rol !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const registro = await prisma.branchWithdrawal.findFirst({
    where: { id: params.id, companyId: companyId! },
    select: { id: true },
  })
  if (!registro) return NextResponse.json({ error: 'Registro no encontrado' }, { status: 404 })

  await prisma.branchWithdrawal.delete({ where: { id: registro.id } })

  return NextResponse.json({ ok: true })
}
