import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { createAuditLog } from '@/lib/audit'

const schema = z.object({
  motivo: z.string().trim().min(10, 'Motivo debe tener al menos 10 caracteres'),
})

/**
 * POST /api/loans/[id]/solicitar-cancelacion-limbo
 *
 * La cobradora solicita cancelar un préstamo APPROVED/IN_ACTIVATION que
 * cayó en limbo. La cobradora NO puede cancelar directamente — necesita
 * que un DG o GZ apruebe la solicitud (vía /decidir-cancelacion-limbo).
 *
 * Esto evita que la cobradora abuse del flujo: cliente toma el dinero,
 * cobradora "cancela" el préstamo y se queda con el efectivo.
 *
 * Reglas:
 *   - Préstamo en APPROVED o IN_ACTIVATION
 *   - No existe ya una solicitud pendiente
 *   - Solicitante: cobrador del préstamo, GZ del branch, DG, DC, SUPER_ADMIN
 *
 * Notifica al GZ del branch + DG + DC para que decidan.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { rol, companyId, id: userId, zonaBranchIds } = session.user

  const loan = await prisma.loan.findFirst({
    where: { id: params.id, companyId: companyId! },
    select: {
      id: true, estado: true, cobradorId: true, branchId: true, companyId: true,
      capital: true,
      client: { select: { nombreCompleto: true } },
    },
  })
  if (!loan) {
    return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })
  }

  let allowed = false
  if (rol === 'SUPER_ADMIN' || rol === 'DIRECTOR_GENERAL' || rol === 'DIRECTOR_COMERCIAL') {
    allowed = true
  } else if (rol === 'COORDINADOR' || rol === 'GERENTE') {
    allowed = loan.cobradorId === userId
  } else if (rol === 'GERENTE_ZONAL') {
    const zoneIds = Array.isArray(zonaBranchIds) ? zonaBranchIds : []
    allowed = zoneIds.includes(loan.branchId) || loan.cobradorId === userId
  }
  if (!allowed) {
    return NextResponse.json({ error: 'Sin permisos sobre este préstamo' }, { status: 403 })
  }

  if (loan.estado !== 'APPROVED' && loan.estado !== 'IN_ACTIVATION') {
    return NextResponse.json(
      { error: 'Solo se puede solicitar cancelación en préstamos APPROVED o IN_ACTIVATION' },
      { status: 400 }
    )
  }

  const yaPendiente = await prisma.solicitudCancelacionLimbo.findUnique({
    where: { loanId: loan.id },
  })
  if (yaPendiente && yaPendiente.estado === 'PENDIENTE') {
    return NextResponse.json(
      { error: 'Ya existe una solicitud de cancelación pendiente para este préstamo' },
      { status: 400 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Motivo requerido' }, { status: 400 })
  }
  const { motivo } = parsed.data

  // Si había una solicitud previa decidida (rechazada o aprobada con error),
  // hacemos upsert para sobrescribir y reabrir el flujo.
  const solicitud = await prisma.solicitudCancelacionLimbo.upsert({
    where: { loanId: loan.id },
    create: {
      loanId: loan.id,
      solicitadoPor: userId,
      motivo,
      estado: 'PENDIENTE',
    },
    update: {
      solicitadoPor: userId,
      motivo,
      estado: 'PENDIENTE',
      aprobadoPor: null,
      decididoAt: null,
      comentarioDecision: null,
    },
  })

  // Notificar al GZ del branch + DG + DC (NO al cobrador, ya está enterado)
  const dgsDcs = await prisma.user.findMany({
    where: {
      companyId: loan.companyId,
      activo: true,
      rol: { in: ['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL'] },
    },
    select: { id: true },
  })
  const allGZ = await prisma.user.findMany({
    where: { companyId: loan.companyId, activo: true, rol: 'GERENTE_ZONAL' },
    select: { id: true, zonaBranchIds: true },
  })
  const gzIds = allGZ
    .filter((u) => {
      const zones = Array.isArray(u.zonaBranchIds) ? (u.zonaBranchIds as string[]) : []
      return zones.includes(loan.branchId)
    })
    .map((u) => u.id)
  const destinatariosIds = Array.from(new Set([...dgsDcs.map((u) => u.id), ...gzIds]))

  const expiraAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
  await prisma.notification.createMany({
    data: destinatariosIds.map((uid) => ({
      companyId: loan.companyId,
      userId: uid,
      loanId: loan.id,
      tipo: 'LIMBO_SOLICITUD_CANCELACION',
      titulo: 'Solicitud de cancelación — requiere autorización',
      mensaje: `Cliente: ${loan.client.nombreCompleto}. Capital: $${Number(loan.capital).toFixed(2)}. Motivo: ${motivo}`,
      esCritica: false,
      expiraAt,
    })),
  })

  createAuditLog({
    userId,
    accion: 'SOLICITAR_CANCELACION_LIMBO',
    tabla: 'Loan',
    registroId: loan.id,
    valoresNuevos: {
      solicitudId: solicitud.id,
      motivo,
      destinatariosNotificados: destinatariosIds.length,
    },
  })

  return NextResponse.json({
    ok: true,
    solicitudId: solicitud.id,
    message: 'Solicitud enviada — pendiente de autorización por DG / GZ',
  })
}
