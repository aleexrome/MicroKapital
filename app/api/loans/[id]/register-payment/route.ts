import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { createAuditLog } from '@/lib/audit'
import { calcTarifaApertura } from '@/lib/financial-formulas'
import { generateTicketNumber, generateTicketQrData } from '@/lib/ticket-generator'
import { todayMx } from '@/lib/timezone'

const registerPaymentSchema = z.object({
  metodoPago: z.enum(['CASH', 'CARD', 'TRANSFER', 'FINANCIADO']),
  cashBreakdown: z.array(z.object({
    denominacion: z.number(),
    cantidad: z.number(),
    subtotal: z.number(),
  })).optional(),
  cambioEntregado: z.number().optional(),
  cuentaDestinoId: z.string().uuid().optional(),
  idTransferencia: z.string().optional(),
})

/**
 * POST /api/loans/[id]/register-payment
 *
 * Candado 2 — registra el Payment de comisión/seguro de apertura.
 *
 * **Pago grupal SOLIDARIO** (Loan.esCoordinadora):
 * Cuando el préstamo es la COORDINADORA del grupo, se cobra el seguro de
 * TODOS los integrantes del grupo en IN_ACTIVATION del mismo ciclo, en una
 * sola transacción. La coordinadora ve el monto total sumado, paga una
 * sola vez y todos los integrantes quedan con su Payment + Loan.seguro*
 * marcados. Para CASH se genera UN solo ticket grupal por el total; para
 * CARD/TRANSFER se omite ticket (la terminal o el sistema bancario tiene
 * su comprobante). Si es INTEGRANTE no-coordinador, se rechaza pidiendo
 * registrar desde el perfil de la coordinadora.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { rol, companyId, id: userId, branchId: sessionBranchId, zonaBranchIds } = session.user

  const loan = await prisma.loan.findFirst({
    where: { id: params.id, companyId: companyId! },
    include: { branch: { select: { nombre: true } } },
  })
  if (!loan) {
    return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })
  }

  // Permisos
  let allowed = false
  if (rol === 'SUPER_ADMIN') {
    allowed = true
  } else if (rol === 'COORDINADOR' || rol === 'GERENTE') {
    allowed = loan.cobradorId === userId
  } else if (rol === 'GERENTE_ZONAL') {
    const zoneIds = Array.isArray(zonaBranchIds) ? zonaBranchIds : []
    allowed = zoneIds.includes(loan.branchId) || loan.cobradorId === userId
  }
  if (!allowed) {
    return NextResponse.json({ error: 'Sin permisos para registrar el pago' }, { status: 403 })
  }

  if (loan.estado !== 'IN_ACTIVATION') {
    return NextResponse.json(
      { error: 'El préstamo debe estar en IN_ACTIVATION para registrar el pago' },
      { status: 400 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const parsed = registerPaymentSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }
  const data = parsed.data

  // ── Determinar los préstamos a procesar ──────────────────────────────────
  type LoanRow = typeof loan
  let targetLoans: LoanRow[] = [loan]
  let pagoGrupal = false

  if (loan.tipo === 'SOLIDARIO' && loan.loanGroupId) {
    const esRenovacion = loan.loanOriginalId !== null
    const cicloFilter = esRenovacion
      ? { loanOriginalId: { not: null } }
      : { loanOriginalId: null }

    if (loan.esCoordinadora) {
      const integrantes = await prisma.loan.findMany({
        where: {
          loanGroupId: loan.loanGroupId,
          estado: 'IN_ACTIVATION',
          ...cicloFilter,
          companyId: companyId!,
        },
        include: { branch: { select: { nombre: true } } },
      }) as LoanRow[]
      if (integrantes.length > 0) {
        targetLoans = integrantes
        pagoGrupal = integrantes.length > 1
      }
    } else {
      const coord = await prisma.loan.findFirst({
        where: {
          loanGroupId: loan.loanGroupId,
          esCoordinadora: true,
          ...cicloFilter,
          companyId: companyId!,
        },
        include: { client: { select: { nombreCompleto: true } } },
      })
      if (coord) {
        return NextResponse.json(
          {
            error: 'REGISTRAR_DESDE_COORDINADORA',
            message: `El pago de la comisión / seguro se registra para todo el grupo desde el perfil de la coordinadora: ${coord.client.nombreCompleto}.`,
            coordinadoraLoanId: coord.id,
            coordinadoraNombre: coord.client.nombreCompleto,
          },
          { status: 400 }
        )
      }
    }
  }

  // ── Validar candado 1 y candado 2 por cada loan target ───────────────────
  for (const target of targetLoans) {
    const contractWithSigned = await prisma.contract.findFirst({
      where: {
        companyId: companyId!,
        loanDocumentFirmadoId: { not: null },
        OR: [
          { loanId: target.id },
          { groupMembers: { some: { loanId: target.id } } },
        ],
      },
      select: { id: true },
    })
    if (!contractWithSigned) {
      return NextResponse.json(
        { error: 'Primero suba el contrato firmado (candado 1)' + (pagoGrupal ? ` — falta para algún integrante` : '') },
        { status: 400 }
      )
    }

    const paymentVigente = await prisma.payment.count({
      where: {
        loanId: target.id,
        scheduleId: null,
        canceledAt: null,
        OR: [
          { notas: { contains: 'apertura', mode: 'insensitive' } },
          { notas: { contains: 'seguro',   mode: 'insensitive' } },
          { notas: { contains: 'comisi',   mode: 'insensitive' } },
        ],
      },
    })
    if (paymentVigente > 0) {
      return NextResponse.json(
        { error: 'Ya existe un pago de comisión registrado' + (pagoGrupal ? ` para algún integrante del grupo` : '') },
        { status: 400 }
      )
    }
  }

  // ── Calcular tarifas por loan + total ────────────────────────────────────
  const tarifas = targetLoans.map((t) => {
    const tarifa = calcTarifaApertura(
      t.tipo as 'SOLIDARIO' | 'INDIVIDUAL' | 'AGIL' | 'FIDUCIARIO',
      Number(t.capital),
      Number(t.comision)
    )
    return { loan: t, tarifa, esFeeSeguro: tarifa.concepto === 'SEGURO' }
  })
  const feeTotal = tarifas.reduce((s, t) => s + t.tarifa.monto, 0)
  const feeConceptoBase = tarifas[0]!.esFeeSeguro ? 'Seguro de apertura' : 'Comisión de apertura'

  const now = new Date()

  // ── FINANCIADO ───────────────────────────────────────────────────────────
  if (data.metodoPago === 'FINANCIADO') {
    await prisma.$transaction(async (tx) => {
      for (const t of tarifas) {
        const nuevoMontoReal = Number(t.loan.montoReal) - t.tarifa.monto
        await tx.loan.update({
          where: { id: t.loan.id },
          data: {
            montoReal: nuevoMontoReal,
            ...(t.esFeeSeguro ? { seguro: t.tarifa.monto } : {}),
            seguroMetodoPago: 'CASH',  // por convención, FINANCIADO se asienta como CASH descontado
            seguroPendiente: false,
          },
        })
        await tx.payment.create({
          data: {
            loanId: t.loan.id,
            cobradorId: userId,
            clientId: t.loan.clientId,
            monto: 0,
            metodoPago: 'CASH',
            cambioEntregado: 0,
            notas: `FINANCIADO - apertura registrada (${t.esFeeSeguro ? 'Seguro' : 'Comisión'} de apertura: $${t.tarifa.monto.toFixed(2)})`,
            fechaHora: now,
          },
        })
      }
    })
    createAuditLog({
      userId,
      accion: pagoGrupal ? 'REGISTER_GROUP_ACTIVATION_FEE_FINANCED' : 'REGISTER_ACTIVATION_FEE_FINANCED',
      tabla: 'Loan',
      registroId: loan.id,
      valoresNuevos: {
        feeTotal,
        metodoPago: 'FINANCIADO',
        ...(pagoGrupal ? { integrantes: targetLoans.length } : {}),
      },
    })
    return NextResponse.json({
      ok: true,
      message: pagoGrupal
        ? `Comisiones financiadas — descontadas del monto entregado a ${targetLoans.length} integrantes`
        : 'Comisión financiada — descontada del monto entregado',
    })
  }

  // ── TRANSFER ─────────────────────────────────────────────────────────────
  if (data.metodoPago === 'TRANSFER') {
    await prisma.$transaction(async (tx) => {
      for (const t of tarifas) {
        await tx.payment.create({
          data: {
            loanId: t.loan.id,
            cobradorId: userId,
            clientId: t.loan.clientId,
            monto: t.tarifa.monto,
            metodoPago: 'TRANSFER',
            cambioEntregado: 0,
            notas: t.esFeeSeguro ? 'Seguro de apertura' : 'Comisión de apertura',
            fechaHora: now,
            cuentaDestinoId: data.cuentaDestinoId ?? null,
            idTransferencia: data.idTransferencia ?? null,
            statusTransferencia: 'PENDIENTE',
          },
        })
        await tx.loan.update({
          where: { id: t.loan.id },
          data: {
            ...(t.esFeeSeguro ? { seguro: t.tarifa.monto } : {}),
            seguroMetodoPago: 'TRANSFER',
            seguroPendiente: true,
          },
        })
      }
    })
    createAuditLog({
      userId,
      accion: pagoGrupal ? 'REGISTER_GROUP_ACTIVATION_FEE_TRANSFER' : 'REGISTER_ACTIVATION_FEE_TRANSFER',
      tabla: 'Loan',
      registroId: loan.id,
      valoresNuevos: {
        feeTotal,
        metodoPago: 'TRANSFER',
        seguroPendiente: true,
        ...(pagoGrupal ? { integrantes: targetLoans.length } : {}),
      },
    })
    return NextResponse.json({
      ok: true,
      seguroPendiente: true,
      message: pagoGrupal
        ? `${feeConceptoBase} grupal registrada por transferencia ($${feeTotal.toFixed(2)} de ${targetLoans.length} integrantes). Pendiente de verificación.`
        : `${feeConceptoBase} registrado por transferencia. Pendiente de verificación por el gerente.`,
    })
  }

  // ── CASH / CARD ──────────────────────────────────────────────────────────
  const metodoCashCard = data.metodoPago as 'CASH' | 'CARD'

  const branchPrefix = loan.branch.nombre
    .split(' ')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 4)
  const targetBranchId = sessionBranchId ?? loan.branchId

  const result = await prisma.$transaction(async (tx) => {
    // 1. Un Payment por integrante con su tarifa individual.
    // El ticket grupal (CASH) se asocia al primer Payment (coordinadora).
    const payments: Array<{ id: string; loanId: string; monto: number }> = []
    for (const t of tarifas) {
      const payment = await tx.payment.create({
        data: {
          loanId: t.loan.id,
          cobradorId: userId,
          clientId: t.loan.clientId,
          monto: t.tarifa.monto,
          metodoPago: metodoCashCard,
          cambioEntregado: 0,  // sólo se aplica al primer pago si hay cambio
          notas: t.esFeeSeguro ? 'Seguro de apertura' : 'Comisión de apertura',
          fechaHora: now,
        },
      })
      payments.push({ id: payment.id, loanId: t.loan.id, monto: t.tarifa.monto })

      await tx.loan.update({
        where: { id: t.loan.id },
        data: {
          ...(t.esFeeSeguro ? { seguro: t.tarifa.monto } : {}),
          seguroMetodoPago: metodoCashCard,
          seguroPendiente: false,
        },
      })
    }

    // 2. CashBreakdown — sólo CASH, asociado al primer Payment (coordinadora)
    //    porque el desglose es del total recibido, no por integrante.
    if (metodoCashCard === 'CASH' && data.cashBreakdown && data.cashBreakdown.length > 0 && payments[0]) {
      await tx.cashBreakdown.createMany({
        data: data.cashBreakdown.map((d) => ({
          paymentId: payments[0]!.id,
          denominacion: d.denominacion,
          cantidad: d.cantidad,
          subtotal: d.subtotal,
        })),
      })
    }

    // 3. CashRegister incrementado por el TOTAL una vez
    const fechaCaja = todayMx()
    await tx.cashRegister.upsert({
      where: { cobradorId_fecha: { cobradorId: userId, fecha: fechaCaja } },
      create: {
        cobradorId: userId,
        branchId: targetBranchId!,
        fecha: fechaCaja,
        cobradoEfectivo: metodoCashCard === 'CASH' ? feeTotal : 0,
        cobradoTarjeta: metodoCashCard === 'CARD' ? feeTotal : 0,
        cobradoTransferencia: 0,
        cambioEntregado: data.cambioEntregado ?? 0,
      },
      update: {
        cobradoEfectivo: metodoCashCard === 'CASH' ? { increment: feeTotal } : undefined,
        cobradoTarjeta:  metodoCashCard === 'CARD' ? { increment: feeTotal } : undefined,
        cambioEntregado: data.cambioEntregado ? { increment: data.cambioEntregado } : undefined,
      },
    })

    // 4. Ticket — sólo CASH, ONE solo ticket por el total grupal,
    //    asociado al primer Payment (coordinadora).
    let ticket = null
    if (metodoCashCard === 'CASH' && feeTotal > 0 && payments[0]) {
      const year = now.getFullYear()
      const numeroTicket = await generateTicketNumber(branchPrefix, year)
      const qrCode = generateTicketQrData(numeroTicket)
      ticket = await tx.ticket.create({
        data: {
          paymentId: payments[0]!.id,
          companyId: companyId!,
          branchId: targetBranchId!,
          numeroTicket,
          impresoPorId: userId,
          qrCode,
        },
      })
    }

    return { payments, ticket }
  })

  createAuditLog({
    userId,
    accion: pagoGrupal ? 'REGISTER_GROUP_ACTIVATION_FEE' : 'REGISTER_ACTIVATION_FEE',
    tabla: 'Loan',
    registroId: loan.id,
    valoresNuevos: {
      feeTotal,
      metodoPago: metodoCashCard,
      ticketNumero: result.ticket?.numeroTicket ?? null,
      ...(pagoGrupal ? { integrantes: targetLoans.length } : {}),
    },
  })

  return NextResponse.json({
    ok: true,
    message: pagoGrupal
      ? `${feeConceptoBase} grupal registrada — $${feeTotal.toFixed(2)} de ${targetLoans.length} integrantes`
      : `${feeConceptoBase} registrado`,
    ticket: result.ticket
      ? { id: result.ticket.id, numeroTicket: result.ticket.numeroTicket }
      : null,
  })
}
