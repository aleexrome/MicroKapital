import type { Prisma, PrismaClient } from '@prisma/client'

/**
 * Borra un préstamo y TODAS sus dependencias directas de la base de datos.
 * Diseñado para las solicitudes rechazadas / canceladas — el negocio ya
 * decidió que esos registros son basura y no queremos conservarlos.
 *
 * Recibe el cliente de transacción (`tx`) — DEBE llamarse dentro de
 * `prisma.$transaction(async (tx) => { await hardDeleteLoan(tx, id) })`.
 *
 * Orden de borrado importa por FKs sin cascade:
 *   1. Ticket (attached to Payment)
 *   2. Payment (loanId FK)
 *   3. PaymentSchedule (loanId FK)
 *   4. LoanApproval (loanId FK)
 *   5. LoanDocument (loanId FK)
 *   6. ScoreEvent (loanId FK)
 *   7. Contract y ContractGroupMember (loanId no está declarado como
 *      @relation en Prisma pero puede existir el registro — los borramos
 *      por si acaso; Contract.loanId es @unique).
 *   8. Notification (loanId es String? sin @relation — se borra por match)
 *   9. NotificacionLimbo + SolicitudCancelacionLimbo ya tienen onDelete:
 *      Cascade, se borran junto con el Loan.
 *   10. Loan
 *
 * Después, si el préstamo pertenecía a un LoanGroup y era el último
 * miembro vivo, borramos también el grupo — no queremos LoanGroup
 * huérfanos ensuciando la BD.
 */
export async function hardDeleteLoan(
  tx: Prisma.TransactionClient | PrismaClient,
  loanId: string,
): Promise<{ groupDeletedId: string | null }> {
  const loan = await tx.loan.findUnique({
    where: { id: loanId },
    select: { id: true, loanGroupId: true },
  })
  if (!loan) return { groupDeletedId: null }

  // Nulificar cualquier renovación futura que apuntara a este loan como
  // original — no queremos romper la FK self-relation. En la práctica un
  // Loan REJECTED/DECLINED casi nunca es "original" de una renovación,
  // pero por robustez lo hacemos.
  await tx.loan.updateMany({
    where: { loanOriginalId: loanId },
    data: { loanOriginalId: null },
  })

  // 1. Tickets — dependen de Payment, se borran primero.
  const payments = await tx.payment.findMany({
    where: { loanId },
    select: { id: true },
  })
  const paymentIds = payments.map((p) => p.id)
  if (paymentIds.length > 0) {
    // Ticket.reimpresiones tiene self-ref onDelete: NoAction implícito.
    // Nulificamos ticketOriginalId antes para poder borrar los originales.
    await tx.ticket.updateMany({
      where: { paymentId: { in: paymentIds } },
      data: { ticketOriginalId: null },
    })
    await tx.ticket.deleteMany({ where: { paymentId: { in: paymentIds } } })
  }

  // 2. Payment (loanId FK)
  await tx.payment.deleteMany({ where: { loanId } })

  // 3. PaymentSchedule (loanId FK)
  await tx.paymentSchedule.deleteMany({ where: { loanId } })

  // 4. LoanApproval (loanId FK)
  await tx.loanApproval.deleteMany({ where: { loanId } })

  // 5. LoanDocument (loanId FK)
  await tx.loanDocument.deleteMany({ where: { loanId } })

  // 6. ScoreEvent (loanId FK)
  await tx.scoreEvent.deleteMany({ where: { loanId } })

  // 7. Contract y sus miembros. loanId no está declarado como @relation en
  // el schema Prisma para Contract/ContractGroupMember, así que borramos
  // por búsqueda directa.
  const contractsDirectos = await tx.contract.findMany({
    where: { loanId },
    select: { id: true },
  })
  const contractsPorGrupo = await tx.contractGroupMember.findMany({
    where: { loanId },
    select: { id: true, contractId: true },
  })
  await tx.contractGroupMember.deleteMany({ where: { loanId } })
  const contractIdsUnicos = Array.from(new Set<string>([
    ...contractsDirectos.map((c) => c.id),
    ...contractsPorGrupo.map((c) => c.contractId),
  ]))
  for (const cid of contractIdsUnicos) {
    // Solo borrar contract si ya no tiene miembros (post-delete). Para
    // contratos directos siempre borrar. Para contratos grupales, ver
    // si quedan otros miembros.
    const restantes = await tx.contractGroupMember.count({ where: { contractId: cid } })
    if (restantes === 0) {
      await tx.contract.deleteMany({ where: { id: cid } })
    }
  }

  // 8. Notification.loanId es String? sin @relation en Prisma. Borrar por
  // match para no dejar avisos apuntando a un préstamo que ya no existe.
  await tx.notification.deleteMany({ where: { loanId } })

  // 9. NotificacionLimbo + SolicitudCancelacionLimbo tienen onDelete
  // Cascade — se irán solitas al borrar el Loan.

  // 10. Loan
  await tx.loan.delete({ where: { id: loanId } })

  // ── LoanGroup cleanup ──────────────────────────────────────────────
  // Si el préstamo pertenecía a un grupo y era el último miembro con
  // cualquier estado (incluyendo LIQUIDATED / ACTIVE / etc.), borramos
  // el grupo — evita LoanGroups vacíos ensuciando la BD.
  let groupDeletedId: string | null = null
  if (loan.loanGroupId) {
    const restantes = await tx.loan.count({ where: { loanGroupId: loan.loanGroupId } })
    if (restantes === 0) {
      await tx.loanGroup.delete({ where: { id: loan.loanGroupId } }).catch(() => {})
      groupDeletedId = loan.loanGroupId
    }
  }

  return { groupDeletedId }
}
