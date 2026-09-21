import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { createAuditLog } from '@/lib/audit'
import { crearNotificacion, getDirectoresIds } from '@/lib/notifications'

const schema = z.object({
  nota: z.string().max(1000).optional(),
})

/**
 * POST /api/loans/[id]/desembolso/escalar
 *
 * Mesa de Control marca el desembolso-video como "escalado a
 * Direccion" cuando detecta algo raro (mismo coord con muchos
 * rechazos, GPS fuera de zona, video que aprobo auto pero se ve
 * fabricado, cliente que no parece el mismo, etc.).
 *
 * Efecto:
 *   1. Se guarda desembolsoEscaladoAt/PorId/Nota en el Loan.
 *   2. Se dispara notificacion a Directores (DG/DC).
 *   3. Queda registrado en AuditLog.
 *
 * No revierte la aprobacion automatica ni desactiva el prestamo — es
 * solo una senal para que Direccion revise. Si Direccion decide que
 * hay fraude real, hay flujos manuales aparte (mora, reject, etc.).
 *
 * Permisos: MESA_CONTROL, DIRECTOR_GENERAL, DIRECTOR_COMERCIAL,
 * SUPER_ADMIN. Los coord/gerentes no pueden auto-escalar sus propios
 * desembolsos.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { rol, companyId, id: userId } = session.user

  const permitidos = ['MESA_CONTROL', 'DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'SUPER_ADMIN']
  if (!permitidos.includes(rol)) {
    return NextResponse.json({ error: 'Sin permisos para escalar desembolsos' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const nota = parsed.data.nota ?? null

  const loan = await prisma.loan.findFirst({
    where: { id: params.id, companyId: companyId! },
    select: {
      id: true, clientId: true, cobradorId: true,
      desembolsoEscaladoAt: true,
      client: { select: { nombreCompleto: true } },
      cobrador: { select: { nombre: true } },
      desembolsoVideoUrl: true,
      desembolsoIntentos: true,
    },
  })
  if (!loan) return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })

  // Solo se puede escalar si el prestamo ya tiene actividad de video
  // (URL subido o al menos un intento). No se puede escalar en el aire.
  if (!loan.desembolsoVideoUrl && (loan.desembolsoIntentos ?? 0) === 0) {
    return NextResponse.json(
      { error: 'Este préstamo no tiene actividad de video de desembolso — no se puede escalar' },
      { status: 400 },
    )
  }

  // Idempotencia soft: si ya esta escalado, actualizamos la nota y
  // el timestamp — sin duplicar notificacion.
  const yaEscalado = loan.desembolsoEscaladoAt !== null

  await prisma.loan.update({
    where: { id: loan.id },
    data: {
      desembolsoEscaladoAt:    new Date(),
      desembolsoEscaladoPorId: userId,
      desembolsoEscaladoNota:  nota,
    },
  })

  createAuditLog({
    userId,
    accion: yaEscalado ? 'DESEMBOLSO_VIDEO_ESCALACION_ACTUALIZADA' : 'DESEMBOLSO_VIDEO_ESCALADO',
    tabla: 'Loan',
    registroId: loan.id,
    valoresNuevos: { nota, escaladoPor: userId },
    ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
  })

  // Notificar a Direccion (best-effort). Si es re-escalamiento no
  // volvemos a notificar para no spamear a DG.
  if (!yaEscalado) {
    try {
      const directores = await getDirectoresIds(prisma, companyId!)
      await crearNotificacion(prisma, {
        companyId: companyId!,
        destinatariosIds: directores,
        tipo: 'DESEMBOLSO_ESCALADO',
        nivel: 'IMPORTANTE',
        titulo: 'Desembolso escalado por Mesa de Control',
        mensaje: `Cliente: ${loan.client.nombreCompleto} · Coord: ${loan.cobrador.nombre}${nota ? ` · Nota: ${nota.slice(0, 120)}` : ''}`,
        loanId: loan.id,
        clientId: loan.clientId,
      })
    } catch (e) {
      console.error('[desembolso-escalar] notif failed:', e)
    }
  }

  return NextResponse.json({ ok: true, yaEscalado })
}
