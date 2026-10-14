import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'

const schema = z.object({
  montoAceptado: z.number().min(0),
})

/**
 * POST /api/cortes/[id]/aceptar
 *
 * El receptor acepta el corte y confirma el monto recibido.
 *
 * Regla A (confirmada con Dirección): el receptor DEBE aceptar el monto
 * exacto = corte.totalAEntregar. Si hay discrepancia, debe rechazar
 * (POST /rechazar con razón). No se permite aceptar con monto distinto.
 *
 * El Corte pasa a ACEPTADO. El dueño del corte se desbloquea.
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
    return NextResponse.json({ error: 'montoAceptado requerido' }, { status: 400 })
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
    return NextResponse.json({ error: 'Solo se puede aceptar un corte ENTREGADO' }, { status: 409 })
  }

  // Regla A: monto exacto o rechazar.
  const esperado = Number(corte.totalAEntregar)
  if (Math.abs(parsed.data.montoAceptado - esperado) > 0.009) {
    return NextResponse.json(
      {
        error: `El monto no coincide (esperado $${esperado.toFixed(2)}, recibido $${parsed.data.montoAceptado.toFixed(2)}). Si hay discrepancia, usa Rechazar con razón.`,
      },
      { status: 400 },
    )
  }

  await prisma.corte.update({
    where: { id: corte.id },
    data: {
      estado:        'ACEPTADO',
      aceptadoAt:    new Date(),
      montoAceptado: parsed.data.montoAceptado,
    },
  })

  createAuditLog({
    userId:        session.user.id,
    accion:        'CORTE_ACEPTADO',
    tabla:         'Corte',
    registroId:    corte.id,
    valoresNuevos: { montoAceptado: parsed.data.montoAceptado, totalAEntregar: esperado },
  })

  return NextResponse.json({ ok: true })
}
