import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'

const schema = z.object({
  razon:         z.string().min(3).max(500),
  montoRealRecibido: z.number().min(0).optional(),
})

/**
 * POST /api/cortes/[id]/rechazar
 *
 * El receptor rechaza el corte (ej. discrepancia de monto, foto no legible,
 * ticket sin firma, etc.). El Corte vuelve a estar bloqueado para el
 * dueño: estado RECHAZADO temporal → el dueño ve la razón y debe re-entregar
 * (que lo pasa a ENTREGADO otra vez con nueva foto).
 *
 * Guardamos la razón visible al dueño. Si el receptor contó un monto
 * distinto, se puede capturar como pista (montoRealRecibido) sin que
 * cambie la lógica.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body   = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Razón requerida (3-500 chars)' }, { status: 400 })
  }

  const corte = await prisma.corte.findFirst({
    where: {
      id:         params.id,
      companyId:  session.user.companyId!,
      receptorId: session.user.id,
    },
  })
  if (!corte) {
    return NextResponse.json({ error: 'Corte no encontrado o no eres el receptor' }, { status: 404 })
  }
  if (corte.estado !== 'ENTREGADO') {
    return NextResponse.json({ error: 'Solo se puede rechazar un corte ENTREGADO' }, { status: 409 })
  }

  await prisma.corte.update({
    where: { id: corte.id },
    data: {
      estado:       'RECHAZADO',
      rechazadoAt:  new Date(),
      rechazoRazon: parsed.data.montoRealRecibido !== undefined
        ? `${parsed.data.razon} (monto real recibido: $${parsed.data.montoRealRecibido.toFixed(2)}; esperado: $${Number(corte.totalAEntregar).toFixed(2)})`
        : parsed.data.razon,
    },
  })

  createAuditLog({
    userId:        session.user.id,
    accion:        'CORTE_RECHAZADO',
    tabla:         'Corte',
    registroId:    corte.id,
    valoresNuevos: {
      razon: parsed.data.razon,
      montoRealRecibido: parsed.data.montoRealRecibido ?? null,
      totalAEntregar:    Number(corte.totalAEntregar),
    },
  })

  return NextResponse.json({ ok: true })
}
