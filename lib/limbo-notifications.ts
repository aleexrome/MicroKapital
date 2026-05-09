import type { PrismaClient, Prisma } from '@prisma/client'

/**
 * Helper para notificar a GZ + DG + DC + cobradora cuando un préstamo en
 * limbo se cancela (ya sea por "cancel-activation" después de IN_ACTIVATION
 * con avance, "cancel-start-activation" antes de cualquier candado, o por
 * solicitud aprobada vía /decidir-cancelacion-limbo).
 *
 * No es crítica: la cancelación es informativa, no bloquea nada. Expira a
 * los 15 días.
 *
 * Acepta `prisma` o un `tx` de transacción para que el caller pueda
 * agruparlo con su lógica de cancelación en una sola unidad atómica.
 */
export async function notificarCancelacionLimbo(
  client: PrismaClient | Prisma.TransactionClient,
  args: {
    loan: {
      id: string
      companyId: string
      branchId: string
      cobradorId: string
      capital: { toString(): string } | number | string
      client: { nombreCompleto: string }
    }
    motivo: string
    canceladoPorUserId: string
    accion: 'CANCEL_ACTIVATION' | 'CANCEL_START_ACTIVATION' | 'SOLICITUD_APROBADA'
  }
): Promise<{ destinatarios: number }> {
  const { loan, motivo, canceladoPorUserId, accion } = args

  // Destinatarios: cobrador + DG/DC de la company + GZ con esa branch en zona
  const dgsDcs = await client.user.findMany({
    where: {
      companyId: loan.companyId,
      activo: true,
      rol: { in: ['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL'] },
    },
    select: { id: true },
  })
  const allGZ = await client.user.findMany({
    where: {
      companyId: loan.companyId,
      activo: true,
      rol: 'GERENTE_ZONAL',
    },
    select: { id: true, zonaBranchIds: true },
  })
  const gzIds = allGZ
    .filter((u) => {
      const zones = Array.isArray(u.zonaBranchIds) ? (u.zonaBranchIds as string[]) : []
      return zones.includes(loan.branchId)
    })
    .map((u) => u.id)
  const destinatariosIds = Array.from(
    new Set([...dgsDcs.map((u) => u.id), ...gzIds, loan.cobradorId])
  )

  const expiraAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
  const tituloMap = {
    CANCEL_ACTIVATION: 'Activación cancelada',
    CANCEL_START_ACTIVATION: 'Activación devuelta a aprobado',
    SOLICITUD_APROBADA: 'Cancelación de préstamo aprobada',
  } as const
  const titulo = tituloMap[accion]
  const mensaje = `Cliente: ${loan.client.nombreCompleto}. Capital: $${Number(loan.capital).toFixed(2)}. Motivo: ${motivo}`

  // Upsert porque (loanId, 'cancelacion') es unique: si el préstamo ya
  // tuvo una cancelación previa (caso "volver atrás" + IN_ACTIVATION + cancelar
  // otra vez), solo refrescamos enviadaAt y la lista de destinatarios.
  await client.notificacionLimbo.upsert({
    where: {
      loanId_tipoNotificacion: { loanId: loan.id, tipoNotificacion: 'cancelacion' },
    },
    create: {
      loanId: loan.id,
      tipoNotificacion: 'cancelacion',
      destinatariosIds,
    },
    update: {
      destinatariosIds,
      enviadaAt: new Date(),
    },
  })
  await client.notification.createMany({
    data: destinatariosIds.map((userId) => ({
      companyId: loan.companyId,
      userId,
      loanId: loan.id,
      tipo: `LIMBO_CANCELACION`,
      titulo,
      mensaje,
      esCritica: false,
      expiraAt,
    })),
  })

  // No genero AuditLog aquí — el endpoint que llama ya genera su propio
  // audit. Esto es solo el efecto colateral notificación.
  void canceladoPorUserId

  return { destinatarios: destinatariosIds.length }
}
