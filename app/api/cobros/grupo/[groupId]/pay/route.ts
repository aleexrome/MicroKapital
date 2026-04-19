import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { generateTicketNumber, generateTicketQrData } from '@/lib/ticket-generator'
import { createAuditLog } from '@/lib/audit'
import { calcScoreEventType, calcDiasDiferencia, getScoreChange, aplicarCambioScore } from '@/lib/score-calculator'

// Estado de pago por integrante
const miembroSchema = z.object({
  scheduleId:            z.string().uuid(),
  loanId:                z.string().uuid(),
  clientId:              z.string().uuid(),
  status:                z.enum(['PAID', 'COVERED', 'UNPAID']),
  cubridoPorClienteId:   z.string().uuid().optional(), // si es COVERED, quién la cubrió
  metodoPago:            z.enum(['CASH', 'CARD', 'TRANSFER']).default('CASH'),
})

const bodySchema = z.object({
  pagos: z.array(miembroSchema).min(1),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { groupId: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { companyId, branchId: userBranchId, id: userId } = session.user

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { pagos } = parsed.data

  // Verificar que el grupo existe y pertenece a la empresa
  const grupo = await prisma.loanGroup.findFirst({
    where: { id: params.groupId, loans: { some: { companyId: companyId! } } },
    select: { id: true, nombre: true },
  })
  if (!grupo) return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 })

  // Cargar todos los schedules de este batch
  const scheduleIds = pagos.map((p) => p.scheduleId)
  const schedules = await prisma.paymentSchedule.findMany({
    where: { id: { in: scheduleIds } },
    include: {
      loan: {
        include: {
          client: true,
          branch: { select: { nombre: true } },
          cobrador: { select: { nombre: true } },
          company: { select: { nombre: true } },
          schedule: { where: { estado: { in: ['PENDING', 'OVERDUE', 'PARTIAL'] } } },
        },
      },
    },
  })

  const scheduleMap = new Map(schedules.map((s) => [s.id, s]))

  // Calcular montos para miembros que cubrieron a otras
  // cubridor → total monto cubierto de otros
  const montoCubiertoMap = new Map<string, number>()
  for (const pago of pagos) {
    if (pago.status === 'COVERED' && pago.cubridoPorClienteId) {
      const prev = montoCubiertoMap.get(pago.cubridoPorClienteId) ?? 0
      const sched = scheduleMap.get(pago.scheduleId)
      montoCubiertoMap.set(pago.cubridoPorClienteId, prev + Number(sched?.montoEsperado ?? 0))
    }
  }

  const now    = new Date()
  const fecha  = new Date(now)
  fecha.setHours(0, 0, 0, 0)

  const tickets: { id: string; numeroTicket: string; clienteNombre: string; monto: number; esCoberturaGrupal: boolean }[] = []

  await prisma.$transaction(async (tx) => {
    for (const pago of pagos) {
      const sched = scheduleMap.get(pago.scheduleId)
      if (!sched) continue

      const loan        = sched.loan
      const montoBase   = Number(sched.montoEsperado)
      const targetBranch = userBranchId ?? loan.branchId
      const branchNombre = loan.branch.nombre
      const branchPrefix = branchNombre.split(' ').map((w) => w[0]?.toUpperCase() ?? '').join('').slice(0, 4)

      if (pago.status === 'UNPAID') {
        // Sin Payment → solo ScoreEvent DEFAULT
        const cambioScore = getScoreChange('DEFAULT')
        const nuevoScore  = aplicarCambioScore(loan.client.score, cambioScore)

        await tx.scoreEvent.create({
          data: {
            clientId:        loan.clientId,
            loanId:          loan.id,
            paymentId:       null,
            registradoPorId: userId,
            tipoEvento:      'DEFAULT',
            diasDiferencia:  0,
            cambioScore,
            scoreResultado:  nuevoScore,
          },
        })

        await tx.client.update({
          where: { id: loan.clientId },
          data: { score: nuevoScore },
        })

        continue
      }

      // PAID o COVERED → crear Payment
      const esCoberturaGrupal = pago.status === 'COVERED'
      const montoCubierto     = !esCoberturaGrupal ? (montoCubiertoMap.get(pago.clientId) ?? 0) : 0
      const montoTotal        = montoBase + montoCubierto

      const payment = await tx.payment.create({
        data: {
          loanId:    loan.id,
          scheduleId: sched.id,
          cobradorId: userId,
          clientId:   loan.clientId,
          monto:      montoTotal,
          metodoPago: pago.metodoPago,
          fechaHora:  now,
          esCoberturaGrupal,
          ...(esCoberturaGrupal ? { cubridoPorClienteId: pago.cubridoPorClienteId ?? null } : {}),
          ...(!esCoberturaGrupal && montoCubierto > 0 ? {
            montoPropio:   montoBase,
            montoCubierto: montoCubierto,
          } : {}),
        },
      })

      // Actualizar schedule
      const nuevoEstado = montoBase >= Number(sched.montoEsperado) ? 'PAID' : 'PARTIAL'
      await tx.paymentSchedule.update({
        where: { id: sched.id },
        data: {
          montoPagado: { increment: montoBase },
          estado:      nuevoEstado,
          pagadoAt:    nuevoEstado === 'PAID' ? now : null,
        },
      })

      // ¿Loan liquidado?
      const otrosPendientes = loan.schedule.filter((s) => s.id !== sched.id)
      if (otrosPendientes.length === 0 && nuevoEstado === 'PAID') {
        await tx.loan.update({ where: { id: loan.id }, data: { estado: 'LIQUIDATED' } })
      }

      // Score
      const diasDiff    = calcDiasDiferencia(sched.fechaVencimiento, now)
      const tipoEvento  = esCoberturaGrupal ? 'LATE_1_7' : calcScoreEventType(diasDiff)
      const cambioScore = getScoreChange(tipoEvento)
      const nuevoScore  = aplicarCambioScore(loan.client.score, cambioScore)

      await tx.scoreEvent.create({
        data: {
          clientId:       loan.clientId,
          loanId:         loan.id,
          paymentId:      payment.id,
          registradoPorId: userId,
          tipoEvento,
          diasDiferencia: diasDiff,
          cambioScore,
          scoreResultado: nuevoScore,
        },
      })
      await tx.client.update({ where: { id: loan.clientId }, data: { score: nuevoScore } })

      // Caja
      await tx.cashRegister.upsert({
        where: { cobradorId_fecha: { cobradorId: userId, fecha } },
        create: {
          cobradorId:            userId,
          branchId:              targetBranch!,
          fecha,
          cobradoEfectivo:       pago.metodoPago === 'CASH'     ? montoTotal : 0,
          cobradoTarjeta:        pago.metodoPago === 'CARD'     ? montoTotal : 0,
          cobradoTransferencia:  pago.metodoPago === 'TRANSFER' ? montoTotal : 0,
          cambioEntregado:       0,
        },
        update: {
          cobradoEfectivo:      pago.metodoPago === 'CASH'     ? { increment: montoTotal } : undefined,
          cobradoTarjeta:       pago.metodoPago === 'CARD'     ? { increment: montoTotal } : undefined,
          cobradoTransferencia: pago.metodoPago === 'TRANSFER' ? { increment: montoTotal } : undefined,
        },
      })

      // Ticket individual
      const numeroTicket = await generateTicketNumber(branchPrefix, now.getFullYear())
      const qrCode       = generateTicketQrData(numeroTicket)
      const ticketRec = await tx.ticket.create({
        data: {
          paymentId:   payment.id,
          companyId:   companyId!,
          branchId:    targetBranch!,
          numeroTicket,
          impresoPorId: userId,
          qrCode,
        },
      })

      tickets.push({
        id:            ticketRec.id,
        numeroTicket,
        clienteNombre: loan.client.nombreCompleto,
        monto:         montoTotal,
        esCoberturaGrupal,
      })
    }
  })

  createAuditLog({
    userId,
    accion:     'GROUP_PAYMENT_BATCH',
    tabla:      'LoanGroup',
    registroId: params.groupId,
    valoresNuevos: {
      grupoNombre: grupo.nombre,
      totalPagos:  tickets.length,
      tickets:     tickets.map((t) => t.numeroTicket),
    },
  })

  return NextResponse.json({ tickets, grupoNombre: grupo.nombre })
}
