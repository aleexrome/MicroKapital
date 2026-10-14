import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { puedeLanzarArqueo } from '@/lib/arqueos'

const cancelarSchema = z.object({
  razon: z.string().min(3).max(300),
})

/**
 * POST /api/arqueos/[id]/cancelar
 *
 * Cualquier DG/DC/SA puede cancelar un arqueo que aún tenga capturas
 * pendientes — útil cuando se lanzó a usuarios equivocados o por error.
 * Las capturas ya realizadas quedan intactas (histórico); las pendientes
 * se marcan canceladas para que los users destrabe su pantalla.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!puedeLanzarArqueo(session.user.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = cancelarSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Razón de cancelación requerida (3-300 chars)' }, { status: 400 })
  }

  const arqueo = await prisma.arqueo.findFirst({
    where: { id: params.id, companyId: session.user.companyId! },
  })
  if (!arqueo) return NextResponse.json({ error: 'Arqueo no encontrado' }, { status: 404 })
  if (arqueo.canceladoAt) {
    return NextResponse.json({ error: 'Este arqueo ya estaba cancelado' }, { status: 409 })
  }

  const now = new Date()
  await prisma.$transaction(async (tx) => {
    await tx.arqueo.update({
      where: { id: arqueo.id },
      data: {
        canceladoAt:    now,
        canceladoPorId: session.user!.id,
        canceladoRazon: parsed.data.razon,
      },
    })
    // Las capturas pendientes se marcan como canceladas para que la
    // pantalla congelada del user se destrabe en el próximo render.
    await tx.arqueoCaptura.updateMany({
      where: {
        arqueoId:    arqueo.id,
        capturadoAt: null,
        canceladoAt: null,
      },
      data: { canceladoAt: now },
    })
  })

  createAuditLog({
    userId: session.user.id,
    accion: 'CANCELAR_ARQUEO',
    tabla:  'Arqueo',
    registroId: arqueo.id,
    valoresNuevos: { razon: parsed.data.razon },
  })

  return NextResponse.json({ ok: true })
}
