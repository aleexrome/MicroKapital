import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { crearNotificacion } from '@/lib/notifications'
import { esReceptorFinal } from '@/lib/cortes'

const schema = z.object({
  accion: z.enum(['CONFIRMAR', 'RECHAZAR']),
  razon:  z.string().optional(),  // requerido si RECHAZAR
})

/**
 * POST /api/cortes/consolidado/[id]/confirmar
 *
 * El DG/DC/SA confirma la recepción del consolidado que la concentradora
 * le entregó. Dos opciones:
 *   • CONFIRMAR → estado = ACEPTADO. Pipeline cerrado para este consolidado.
 *   • RECHAZAR  → estado = RECHAZADO, se liberan los parciales hijos
 *     (consolidadoPadreId = null) para que la concentradora pueda crear
 *     otro consolidado nuevo con los mismos.
 *
 * No se editan montos — la regla del negocio es que el sistema arroja
 * los números y DG/DC solo confirma "recibí" / "no recibí".
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: userId, rol, companyId } = session.user
  if (!esReceptorFinal(rol)) {
    return NextResponse.json({ error: 'Solo DG/DC/SA pueden confirmar un consolidado' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const { accion, razon } = parsed.data

  if (accion === 'RECHAZAR' && (!razon || razon.trim().length < 3)) {
    return NextResponse.json({ error: 'Razón del rechazo requerida' }, { status: 400 })
  }

  const corte = await prisma.corte.findFirst({
    where: { id: params.id, companyId: companyId! },
  })
  if (!corte) return NextResponse.json({ error: 'Consolidado no encontrado' }, { status: 404 })
  if (corte.tipo !== 'CONSOLIDADO') {
    return NextResponse.json({ error: 'No es un consolidado' }, { status: 400 })
  }
  if (corte.receptorId !== userId) {
    return NextResponse.json({ error: 'No eres el receptor de este consolidado' }, { status: 403 })
  }
  if (corte.estado !== 'ENTREGADO') {
    return NextResponse.json({
      error: `No se puede confirmar un consolidado en estado ${corte.estado}`,
    }, { status: 400 })
  }

  const ahora = new Date()

  await prisma.$transaction(async (tx) => {
    if (accion === 'CONFIRMAR') {
      await tx.corte.update({
        where: { id: corte.id },
        data: {
          estado:        'ACEPTADO',
          aceptadoAt:    ahora,
          montoAceptado: corte.totalAEntregar,
        },
      })
    } else {
      // RECHAZAR: liberar parciales hijos para que puedan agruparse
      // en otro consolidado nuevo.
      await tx.corte.update({
        where: { id: corte.id },
        data: {
          estado:       'RECHAZADO',
          rechazadoAt:  ahora,
          rechazoRazon: razon,
        },
      })
      await tx.corte.updateMany({
        where: { consolidadoPadreId: corte.id },
        data:  { consolidadoPadreId: null },
      })
    }
  })

  createAuditLog({
    userId,
    accion: accion === 'CONFIRMAR' ? 'CONFIRMAR_CONSOLIDADO' : 'RECHAZAR_CONSOLIDADO',
    tabla:  'Corte',
    registroId: corte.id,
    valoresNuevos: {
      estado: accion === 'CONFIRMAR' ? 'ACEPTADO' : 'RECHAZADO',
      ...(accion === 'RECHAZAR' ? { razon } : {}),
      montoAEntregar: Number(corte.totalAEntregar),
    },
  })

  // Notificar a la concentradora
  try {
    await crearNotificacion(prisma, {
      companyId: companyId!,
      destinatariosIds: [corte.userId],
      tipo: accion === 'CONFIRMAR' ? 'CORTE_ACEPTADO' : 'CORTE_RECHAZADO',
      nivel: accion === 'CONFIRMAR' ? 'INFORMATIVA' : 'IMPORTANTE',
      titulo: accion === 'CONFIRMAR'
        ? 'Consolidado confirmado'
        : 'Consolidado rechazado — rehacer entrega',
      mensaje: accion === 'CONFIRMAR'
        ? `${session.user.name} confirmó la recepción del consolidado por $${Number(corte.totalAEntregar).toFixed(2)}.`
        : `${session.user.name} rechazó el consolidado. Razón: ${razon}. Los parciales se liberaron, puedes crear un consolidado nuevo.`,
    })
  } catch (e) {
    console.error('[cortes/consolidado/confirmar] notif failed:', e)
  }

  return NextResponse.json({ ok: true, estado: accion === 'CONFIRMAR' ? 'ACEPTADO' : 'RECHAZADO' })
}
