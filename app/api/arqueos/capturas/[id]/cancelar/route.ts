import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { puedeLanzarArqueo } from '@/lib/arqueos'

const schema = z.object({
  razon: z.string().min(3).max(300).optional().default('Liberación individual por el admin'),
})

/**
 * POST /api/arqueos/capturas/[id]/cancelar
 *
 * Cancela UNA sola captura (libera al usuario target de la pantalla
 * congelada) sin tocar las demás capturas del mismo arqueo. Útil cuando
 * un admin lanzó un arqueo global/branch y quiere exceptuar a algunos
 * usuarios sobre la marcha (p.ej. está de vacaciones, incapacitado,
 * acaba de capturar en otro, etc).
 *
 * Autoriza: DG / DC / SUPER_ADMIN. Si la captura ya fue completada
 * (capturadoAt no es null) regresa 409 — ya no tiene sentido liberarla.
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
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Razón inválida (3-300 chars)' }, { status: 400 })
  }

  const captura = await prisma.arqueoCaptura.findFirst({
    where: { id: params.id, arqueo: { companyId: session.user.companyId! } },
    include: { user: { select: { nombre: true } }, arqueo: { select: { id: true, tipo: true } } },
  })
  if (!captura) return NextResponse.json({ error: 'Captura no encontrada' }, { status: 404 })
  if (captura.capturadoAt) {
    return NextResponse.json({ error: 'Esta captura ya fue completada; no se puede liberar' }, { status: 409 })
  }
  if (captura.canceladoAt) {
    return NextResponse.json({ error: 'Esta captura ya estaba cancelada' }, { status: 409 })
  }

  await prisma.arqueoCaptura.update({
    where: { id: captura.id },
    data:  { canceladoAt: new Date() },
  })

  createAuditLog({
    userId:        session.user.id,
    accion:        'CANCELAR_ARQUEO_CAPTURA',
    tabla:         'ArqueoCaptura',
    registroId:    captura.id,
    valoresNuevos: {
      arqueoId:   captura.arqueoId,
      tipoArqueo: captura.arqueo.tipo,
      liberado:   captura.user.nombre,
      razon:      parsed.data.razon,
    },
  })

  return NextResponse.json({ ok: true })
}
