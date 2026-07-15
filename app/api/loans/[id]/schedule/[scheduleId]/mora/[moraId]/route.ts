import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { startOfDayMx } from '@/lib/timezone'

/**
 * DELETE /api/loans/[id]/schedule/[scheduleId]/mora/[moraId]
 *
 * Deshace un cobro de multa/mora — solo DG / DC / SUPER_ADMIN. Espeja
 * el flujo de /schedule/[scheduleId]/undo pero enfocado al Payment del
 * cobro de la mora:
 *   - Revierte CashRegister del cobrador (día del Payment).
 *   - Borra CashBreakdown, Ticket (reimpresiones + original) y Payment.
 *   - Borra la MoraCobro (queda como si nunca se hubiera cobrado — al
 *     próximo `apply` o cobro tardío se generará una pendiente nueva
 *     según las opciones que apliquen en ese momento).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; scheduleId: string; moraId: string } },
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, id: userId } = session.user
  if (rol !== 'DIRECTOR_GENERAL' && rol !== 'DIRECTOR_COMERCIAL' && rol !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const mora = await prisma.moraCobro.findFirst({
    where: {
      id: params.moraId,
      scheduleId: params.scheduleId,
      loanId: params.id,
      companyId: companyId!,
    },
    include: {
      paymentCobro: {
        select: {
          id: true,
          monto: true,
          metodoPago: true,
          fechaHora: true,
          cobradorId: true,
        },
      },
    },
  })
  if (!mora) return NextResponse.json({ error: 'Cobro no encontrado' }, { status: 404 })

  const snapshotAntes = {
    tipo: mora.tipo,
    monto: Number(mora.monto),
    cobrada: mora.cobrada,
    paymentCobroId: mora.paymentCobroId,
  }

  await prisma.$transaction(async (tx) => {
    const pago = mora.paymentCobro
    if (pago) {
      const fechaCaja = startOfDayMx(new Date(pago.fechaHora))
      const monto = Number(pago.monto)

      await tx.cashRegister.updateMany({
        where: { cobradorId: pago.cobradorId, fecha: fechaCaja },
        data: {
          cobradoEfectivo:      pago.metodoPago === 'CASH'     ? { decrement: monto } : undefined,
          cobradoTarjeta:       pago.metodoPago === 'CARD'     ? { decrement: monto } : undefined,
          cobradoTransferencia: pago.metodoPago === 'TRANSFER' ? { decrement: monto } : undefined,
        },
      })

      await tx.cashBreakdown.deleteMany({ where: { paymentId: pago.id } })

      const ticketsDelPago = await tx.ticket.findMany({
        where: { paymentId: pago.id },
        select: { id: true },
      })
      if (ticketsDelPago.length > 0) {
        const ticketIds = ticketsDelPago.map((t) => t.id)
        await tx.ticket.updateMany({
          where: { ticketOriginalId: { in: ticketIds } },
          data:  { ticketOriginalId: null },
        })
      }
      await tx.ticket.deleteMany({ where: { paymentId: pago.id, esReimpresion: true } })
      await tx.ticket.deleteMany({ where: { paymentId: pago.id, esReimpresion: false } })

      await tx.scoreEvent.updateMany({
        where: { paymentId: pago.id },
        data:  { paymentId: null },
      })

      // Desligamos el paymentCobroId antes de borrar el Payment — el FK
      // en MoraCobro tiene SetNull en delete, pero después borramos la
      // MoraCobro completa, así que no importa el orden aquí.
      await tx.moraCobro.delete({ where: { id: mora.id } })
      await tx.payment.delete({ where: { id: pago.id } })
    } else {
      await tx.moraCobro.delete({ where: { id: mora.id } })
    }
  })

  createAuditLog({
    userId,
    accion: 'DESHACER_MORA',
    tabla: 'MoraCobro',
    registroId: mora.id,
    valoresAnteriores: snapshotAntes,
    valoresNuevos: { cobrada: false, deleted: true },
  })

  return NextResponse.json({ message: 'Cobro de multa/mora revertido' })
}
