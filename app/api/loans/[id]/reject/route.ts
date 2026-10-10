import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { crearNotificacion, getGerentesZonalesIds } from '@/lib/notifications'
import { hardDeleteLoan } from '@/lib/hard-delete-loan'
import { z } from 'zod'

const rejectSchema = z.object({
  razonRechazo: z.string().min(5, 'Razón de rechazo requerida'),
})

/**
 * DG rechaza una solicitud PENDING_APPROVAL. Antes se guardaba con estado
 * REJECTED como historial, pero solo era basura en el sistema; ahora se
 * borra por completo. Se notifica a la cobradora + GZ antes del delete
 * porque después no queda ni el loanId para navegar.
 *
 * SOLIDARIO: cuando el préstamo rechazado pertenece a un grupo, la
 * acción se propaga a los demás integrantes del grupo DEL MISMO CICLO
 * para evitar que queden préstamos huérfanos en IN_ACTIVATION después
 * del rechazo (caso real: grupo AURORA BOREAL, 2026-10-08 — DG rechazó
 * el grupo pero 3 préstamos ya aprobados quedaron atorados sin schedules
 * ni evidencia).
 *
 * Propagación:
 *   - PENDING_APPROVAL → hard delete (todo el grupo se rechaza)
 *   - IN_ACTIVATION    → vuelve a PENDING_APPROVAL (anula aprobación)
 *                        para que el coord pueda editar el grupo
 *   - ACTIVE           → NO se toca (ya desembolsado, no es revertible)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId } = session.user

  if (rol !== 'DIRECTOR_GENERAL' && rol !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Sin permisos — solo el Director General puede rechazar créditos' }, { status: 403 })
  }

  const loan = await prisma.loan.findFirst({
    where: { id: params.id, companyId: companyId! },
    include: {
      client: { select: { id: true, nombreCompleto: true } },
    },
  })

  if (!loan) return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })
  if (loan.estado !== 'PENDING_APPROVAL') {
    return NextResponse.json({ error: 'El préstamo no está pendiente' }, { status: 400 })
  }

  const body = await req.json()
  const parsed = rejectSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  // Snapshot para la notificación — después del delete ya no hay loanId.
  const clienteNombre = loan.client.nombreCompleto
  const clientId = loan.clientId
  const cobradorId = loan.cobradorId
  const branchId = loan.branchId

  // ── Resolver integrantes del grupo (si aplica) ────────────────────
  // Mismo ciclo (loanOriginalId null vs not null — así renovaciones no
  // se mezclan con créditos nuevos del mismo grupo).
  let hermanosPending: { id: string }[] = []
  let hermanosEnActivacion: { id: string }[] = []
  if (loan.tipo === 'SOLIDARIO' && loan.loanGroupId) {
    const esRenovacion = loan.loanOriginalId !== null
    const cicloFilter = esRenovacion
      ? { loanOriginalId: { not: null } }
      : { loanOriginalId: null }

    const hermanos = await prisma.loan.findMany({
      where: {
        loanGroupId: loan.loanGroupId,
        companyId:   companyId!,
        id:          { not: loan.id }, // el loan principal se maneja aparte
        estado:      { in: ['PENDING_APPROVAL', 'IN_ACTIVATION'] },
        ...cicloFilter,
      },
      select: { id: true, estado: true },
    })
    hermanosPending      = hermanos.filter((h) => h.estado === 'PENDING_APPROVAL')
    hermanosEnActivacion = hermanos.filter((h) => h.estado === 'IN_ACTIVATION')
  }

  // Notificar ANTES del borrado — el hilo del payload puede referenciar
  // loanId (útil si algún viewer lo abriera antes del delete), pero
  // sobre todo garantiza que el aviso llegue aunque el delete falle.
  try {
    const gerentes = await getGerentesZonalesIds(prisma, companyId!, branchId)
    const extraMsg = hermanosEnActivacion.length > 0
      ? ` (${hermanosEnActivacion.length + 1} integrantes del grupo devueltos a solicitud)`
      : hermanosPending.length > 0
      ? ` (todo el grupo rechazado — ${hermanosPending.length + 1} integrantes)`
      : ''
    await crearNotificacion(prisma, {
      companyId: companyId!,
      destinatariosIds: [cobradorId, ...gerentes],
      tipo: 'SOLICITUD_RECHAZADA',
      nivel: 'IMPORTANTE',
      titulo: 'Solicitud rechazada',
      mensaje: `${clienteNombre} — rechazada por el Director General. Motivo: ${parsed.data.razonRechazo}${extraMsg}`,
      clientId,
    })
  } catch (e) {
    console.error('[reject] notif failed:', e)
  }

  await prisma.$transaction(async (tx) => {
    // 1. Hermanos en IN_ACTIVATION → volver a PENDING_APPROVAL para que
    //    el coord corrija el grupo (ej. agregar integrante faltante).
    //    Limpiamos aprobadoPorId/At para que el flujo de aprobación
    //    arranque limpio al re-enviar.
    if (hermanosEnActivacion.length > 0) {
      await tx.loan.updateMany({
        where: { id: { in: hermanosEnActivacion.map((h) => h.id) } },
        data:  {
          estado:          'PENDING_APPROVAL',
          aprobadoPorId:   null,
          aprobadoAt:      null,
        },
      })
    }
    // 2. Hermanos en PENDING_APPROVAL → hard delete junto con el loan
    //    principal (todo el grupo se rechaza).
    for (const h of hermanosPending) {
      await hardDeleteLoan(tx, h.id)
    }
    // 3. El loan principal — hard delete.
    await hardDeleteLoan(tx, loan.id)
  })

  const summary = hermanosEnActivacion.length > 0 || hermanosPending.length > 0
    ? ` Grupo: ${hermanosEnActivacion.length} devuelto(s) a solicitud, ${hermanosPending.length + 1} rechazado(s).`
    : ''

  return NextResponse.json({
    message: `Préstamo rechazado y eliminado del historial.${summary}`,
  })
}
