import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { generateTicketNumber, generateTicketQrData } from '@/lib/ticket-generator'
import { createAuditLog } from '@/lib/audit'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { companyId, id: userId } = session.user

  const cobrador = await prisma.user.findFirst({
    where: { companyId: companyId!, email: session.user.email! },
  })
  if (!cobrador) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const original = await prisma.ticket.findFirst({
    where: { id: params.id, companyId: companyId! },
  })

  if (!original) return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 })
  if (original.anulado) return NextResponse.json({ error: 'No se puede reimprimir un ticket anulado' }, { status: 400 })

  // Obtener el ticket original raíz (si este ya es reimpresión)
  const originalId = original.ticketOriginalId ?? original.id

  const branchName = await prisma.branch.findUnique({
    where: { id: original.branchId },
    select: { nombre: true },
  })

  const branchPrefix = (branchName?.nombre ?? 'XX')
    .split(' ')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 4)

  const year = new Date().getFullYear()
  const numeroTicket = await generateTicketNumber(branchPrefix, year)
  const qrCode = generateTicketQrData(numeroTicket)

  const reimpresion = await prisma.ticket.create({
    data: {
      paymentId: original.paymentId,
      companyId: original.companyId,
      branchId: original.branchId,
      numeroTicket,
      impresoPorId: cobrador.id,
      esReimpresion: true,
      ticketOriginalId: originalId,
      razonReimpresion: 'Reimpresión solicitada por cobrador',
      qrCode,
    },
  })

  createAuditLog({
    userId,
    accion: 'REPRINT_TICKET',
    tabla: 'Ticket',
    registroId: reimpresion.id,
    valoresNuevos: { ticketOriginalId: originalId, numeroTicket },
  })

  return NextResponse.json({ data: reimpresion })
}
