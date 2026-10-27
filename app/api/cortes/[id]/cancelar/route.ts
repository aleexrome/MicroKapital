import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'

/**
 * DELETE /api/cortes/[id]/cancelar
 *
 * Cancela un Corte ABIERTO del user. Para el caso donde el usuario
 * abrió un parcial o consolidado por accidente y quiere deshacerlo.
 *
 * Reglas:
 *   • Solo el dueño del corte puede cancelarlo
 *   • Solo si estado = ABIERTO (no se puede cancelar algo ya entregado
 *     o aceptado — para eso está el flujo de rechazo del receptor)
 *   • Si es un CONSOLIDADO, los parciales hijos se liberan
 *     (consolidadoPadreId = null) para poder re-agruparse después
 *   • El Corte se BORRA de la BD (no queda historial — fue un error)
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: userId, companyId } = session.user

  const corte = await prisma.corte.findFirst({
    where: { id: params.id, companyId: companyId! },
    select: {
      id: true,
      userId: true,
      estado: true,
      tipo: true,
      numeroCorte: true,
      totalAEntregar: true,
    },
  })

  if (!corte) return NextResponse.json({ error: 'Corte no encontrado' }, { status: 404 })
  if (corte.userId !== userId) {
    return NextResponse.json({ error: 'No es tu corte' }, { status: 403 })
  }
  if (corte.estado !== 'ABIERTO') {
    return NextResponse.json({
      error: `No se puede cancelar un corte en estado ${corte.estado}. Solo los ABIERTO pueden cancelarse.`,
    }, { status: 400 })
  }

  await prisma.$transaction(async (tx) => {
    // Si es CONSOLIDADO, liberar parciales hijos primero (poner
    // consolidadoPadreId=null) para que puedan agruparse en otro
    // consolidado después.
    if (corte.tipo === 'CONSOLIDADO') {
      await tx.corte.updateMany({
        where: { consolidadoPadreId: corte.id },
        data:  { consolidadoPadreId: null },
      })
    }
    await tx.corte.delete({ where: { id: corte.id } })
  })

  createAuditLog({
    userId,
    accion: 'CORTE_CANCELADO',
    tabla:  'Corte',
    registroId: corte.id,
    valoresAnteriores: {
      tipo: corte.tipo,
      numeroCorte: corte.numeroCorte,
      estado: corte.estado,
      totalAEntregar: Number(corte.totalAEntregar),
    },
  })

  return NextResponse.json({ ok: true })
}
