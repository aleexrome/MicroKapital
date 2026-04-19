import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { generateTicketNumber, generateTicketQrData } from '@/lib/ticket-generator'
import { createAuditLog } from '@/lib/audit'
import { calcScoreEventType, calcDiasDiferencia, getScoreChange, aplicarCambioScore } from '@/lib/score-calculator'

const cashBreakdownSchema = z.object({
  denominacion: z.number().int().positive(),
  cantidad:     z.number().int().positive(),
  subtotal:     z.number().positive(),
})

/**
 * Flujo B: todos los integrantes del grupo pagan juntos con el mismo método.
 * Si alguno no trae su parte, el cobrador la cobra después desde el flujo
 * individual. Por eso este endpoint ya no recibe estado por integrante:
 * solo el método de pago y (para efectivo/transferencia) su información.
 */
const bodySchema = z.object({
  metodoPago:      z.enum(['CASH', 'CARD', 'TRANSFER']),
  cambioEntregado: z.number().min(0).default(0),
  cashBreakdown:   z.array(cashBreakdownSchema).optional().default([]),
  cuentaDestinoId: z.string().uuid().optional(),
  idTransferencia: z.string().optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { groupId: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { companyId, branchId: userBranchId, id: userId, rol } = session.user
  const tienePermisoAplicar = session.user.permisoAplicarPagos === true

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    const path = first?.path?.join('.') ?? ''
    const msg = `Datos inválidos${path ? ` (${path})` : ''}: ${first?.message ?? 'verifica los campos'}`
    return NextResponse.json({ error: msg, fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const data = parsed.data

  // ── Verificar que el grupo existe y pertenece a la empresa ────────────────
  const grupo = await prisma.loanGroup.findFirst({
    where: { id: params.groupId, loans: { some: { companyId: companyId! } } },
    select: { id: true, nombre: true },
  })
  if (!grupo) return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 })

  // ── Alcance por rol (quién puede cobrar este grupo) ───────────────────────
  const zonaBranchIds = session.user.zonaBranchIds ?? []
  const autorizaLoan = (loan: { cobradorId: string; branchId: string }): boolean => {
    if (rol === 'DIRECTOR_GENERAL' || rol === 'SUPER_ADMIN') return true
    if (rol === 'COORDINADOR' || rol === 'COBRADOR') return loan.cobradorId === userId
    if (rol === 'GERENTE' || rol === 'GERENTE_ZONAL') {
      const zonas = zonaBranchIds.length ? zonaBranchIds : userBranchId ? [userBranchId] : []
      return zonas.length === 0 || zonas.includes(loan.branchId)
    }
    if (tienePermisoAplicar && userBranchId) return loan.branchId === userBranchId
    return false
  }

  // ── Cargar préstamos activos del grupo dentro del alcance ─────────────────
  const loans = await prisma.loan.findMany({
    where: {
      loanGroupId: params.groupId,
      estado:      'ACTIVE',
      companyId:   companyId!,
    },
    include: {
      client:   true,
      branch:   { select: { nombre: true } },
      cobrador: { select: { nombre: true } },
      company:  { select: { nombre: true } },
      schedule: {
        where: { estado: { in: ['PENDING', 'OVERDUE', 'PARTIAL'] } },
        orderBy: { numeroPago: 'asc' },
        take: 1,
      },
    },
  })

  const loansAutorizados = loans.filter((l) => autorizaLoan({ cobradorId: l.cobradorId, branchId: l.branchId }))
  if (loansAutorizados.length === 0) {
    return NextResponse.json({ error: 'No autorizado para cobrar este grupo' }, { status: 403 })
  }

  const loansPagables = loansAutorizados.filter((l) => l.schedule.length > 0)
  if (loansPagables.length === 0) {
    return NextResponse.json({ error: 'El grupo no tiene pagos pendientes' }, { status: 400 })
  }

  // ── Validar breakdown de efectivo ─────────────────────────────────────────
  const totalEsperado = loansPagables.reduce((s, l) => s + Number(l.schedule[0]!.montoEsperado), 0)
  if (data.metodoPago === 'CASH' && data.cashBreakdown.length > 0) {
    const totalBreakdown = data.cashBreakdown.reduce((s, b) => s + b.subtotal, 0)
    if (totalBreakdown < totalEsperado) {
      return NextResponse.json({ error: 'El desglose de efectivo no cubre el total del grupo' }, { status: 400 })
    }
  }

  const now = new Date()
  const fechaDia = new Date(now); fechaDia.setHours(0, 0, 0, 0)
  const cobradorDb = await prisma.user.findUnique({
    where: { id: userId },
    select: { nombre: true },
  })
  const cobradorNombre = cobradorDb?.nombre ?? ''

  const firstLoan = loansPagables[0]!
  const targetBranch = userBranchId ?? firstLoan.branchId
  const branchPrefix = firstLoan.branch.nombre
    .split(' ')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 4)

  // Pre-reservar los números de ticket FUERA de la transacción.
  // `generateTicketNumber` lee el último ticket de la BD y suma 1; si lo
  // llamásemos N veces en loop TODAS las llamadas leerían el mismo estado y
  // devolverían el mismo número — fallan con unique constraint al guardar.
  // En vez de eso leemos una sola vez el último número y reservamos N
  // consecutivos localmente.
  const year = now.getFullYear()
  const prefix = `${branchPrefix.toUpperCase()}-${year}-`
  let ticketNumbers: string[] = []
  try {
    const lastTicket = await prisma.ticket.findFirst({
      where: { numeroTicket: { startsWith: prefix } },
      orderBy: { numeroTicket: 'desc' },
      select: { numeroTicket: true },
    })
    let nextNum = 1
    if (lastTicket) {
      const parts = lastTicket.numeroTicket.split('-')
      const lastNum = parseInt(parts[parts.length - 1] ?? '', 10)
      if (!isNaN(lastNum)) nextNum = lastNum + 1
    }
    ticketNumbers = loansPagables.map((_, i) =>
      `${prefix}${String(nextNum + i).padStart(5, '0')}`
    )
  } catch (e) {
    console.error('[group-pay] error generando números de ticket', e)
    return NextResponse.json({ error: 'No se pudo generar el número de ticket' }, { status: 500 })
  }

  // ── Transacción: crear Payments + schedule updates + ticket por integrante
  const tickets: { id: string; numeroTicket: string; clienteNombre: string; monto: number }[] = []

  try {
    await prisma.$transaction(async (tx) => {
    let breakdownAdjuntado = false

    for (let i = 0; i < loansPagables.length; i++) {
      const loan = loansPagables[i]!
      const sched = loan.schedule[0]!
      const montoBase = Number(sched.montoEsperado)

      // 1. Crear Payment
      const payment = await tx.payment.create({
        data: {
          loanId:     loan.id,
          scheduleId: sched.id,
          cobradorId: userId,
          clientId:   loan.clientId,
          monto:      montoBase,
          metodoPago: data.metodoPago,
          cambioEntregado: 0,
          fechaHora:  now,
          ...(data.metodoPago === 'TRANSFER' ? {
            cuentaDestinoId:     data.cuentaDestinoId ?? null,
            idTransferencia:     data.idTransferencia ?? null,
            statusTransferencia: 'PENDIENTE',
          } : {}),
        },
      })

      // 2. Cash breakdown — se adjunta al PRIMER payment del grupo solamente,
      //    representando el efectivo total recibido por el cobrador.
      if (data.metodoPago === 'CASH' && data.cashBreakdown.length > 0 && !breakdownAdjuntado) {
        await tx.cashBreakdown.createMany({
          data: data.cashBreakdown.map((d) => ({
            paymentId:    payment.id,
            denominacion: d.denominacion,
            cantidad:     d.cantidad,
            subtotal:     d.subtotal,
          })),
        })
        if (data.cambioEntregado > 0) {
          await tx.payment.update({
            where: { id: payment.id },
            data:  { cambioEntregado: data.cambioEntregado },
          })
        }
        breakdownAdjuntado = true
      }

      // 3. Marcar schedule como pagado
      await tx.paymentSchedule.update({
        where: { id: sched.id },
        data: {
          montoPagado: { increment: montoBase },
          estado:      'PAID',
          pagadoAt:    now,
        },
      })

      // 4. ¿Loan liquidado?
      const restantes = await tx.paymentSchedule.count({
        where: { loanId: loan.id, id: { not: sched.id }, estado: { not: 'PAID' } },
      })
      if (restantes === 0) {
        await tx.loan.update({ where: { id: loan.id }, data: { estado: 'LIQUIDATED' } })
      }

      // 5. Score event
      const diasDiff    = calcDiasDiferencia(sched.fechaVencimiento, now)
      const tipoEvento  = calcScoreEventType(diasDiff)
      const cambioScore = getScoreChange(tipoEvento)
      const nuevoScore  = aplicarCambioScore(loan.client.score, cambioScore)

      await tx.scoreEvent.create({
        data: {
          clientId:        loan.clientId,
          loanId:          loan.id,
          paymentId:       payment.id,
          registradoPorId: userId,
          tipoEvento,
          diasDiferencia:  diasDiff,
          cambioScore,
          scoreResultado:  nuevoScore,
        },
      })
      await tx.client.update({ where: { id: loan.clientId }, data: { score: nuevoScore } })

      // 6. Ticket individual (número pre-generado fuera de la transacción)
      const numeroTicket = ticketNumbers[i]!
      const qrCode       = generateTicketQrData(numeroTicket)
      const ticketRec = await tx.ticket.create({
        data: {
          paymentId:    payment.id,
          companyId:    companyId!,
          branchId:     targetBranch!,
          numeroTicket,
          impresoPorId: userId,
          qrCode,
        },
      })

      tickets.push({
        id:            ticketRec.id,
        numeroTicket,
        clienteNombre: loan.client.nombreCompleto,
        monto:         montoBase,
      })
    }

    // 7. Caja del cobrador (una sola vez con el total del grupo)
    await tx.cashRegister.upsert({
      where:  { cobradorId_fecha: { cobradorId: userId, fecha: fechaDia } },
      create: {
        cobradorId:           userId,
        branchId:             targetBranch!,
        fecha:                fechaDia,
        cobradoEfectivo:      data.metodoPago === 'CASH'     ? totalEsperado : 0,
        cobradoTarjeta:       data.metodoPago === 'CARD'     ? totalEsperado : 0,
        cobradoTransferencia: data.metodoPago === 'TRANSFER' ? totalEsperado : 0,
        cambioEntregado:      data.cambioEntregado,
      },
      update: {
        cobradoEfectivo:      data.metodoPago === 'CASH'     ? { increment: totalEsperado } : undefined,
        cobradoTarjeta:       data.metodoPago === 'CARD'     ? { increment: totalEsperado } : undefined,
        cobradoTransferencia: data.metodoPago === 'TRANSFER' ? { increment: totalEsperado } : undefined,
        cambioEntregado:      data.cambioEntregado > 0 ? { increment: data.cambioEntregado } : undefined,
      },
    })
    }, { timeout: 20000 })
  } catch (e) {
    console.error('[group-pay] transacción falló', e)
    const msg = e instanceof Error ? e.message : 'Error al registrar el pago grupal'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  createAuditLog({
    userId,
    accion:     'GROUP_PAYMENT_BATCH',
    tabla:      'LoanGroup',
    registroId: params.groupId,
    valoresNuevos: {
      grupoNombre: grupo.nombre,
      metodoPago:  data.metodoPago,
      totalCobrado: totalEsperado,
      tickets:     tickets.map((t) => t.numeroTicket),
    },
  })

  return NextResponse.json({
    tickets,
    grupoNombre: grupo.nombre,
    groupTicketMeta: {
      empresa:  firstLoan.company.nombre,
      sucursal: firstLoan.branch.nombre,
      cobrador: cobradorNombre,
      fecha:    now.toISOString(),
      qrCode:   tickets[0]?.numeroTicket
        ? `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.microkapital.com'}/verificar/${tickets[0].numeroTicket}`
        : null,
    },
  })
}
