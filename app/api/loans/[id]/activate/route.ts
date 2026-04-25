import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { type Prisma } from '@prisma/client'
import {
  generarFechasSemanales, generarFechasHabiles, generarFechasQuincenales,
  generarFechasSemanalesDesde, generarFechasHabilesDesde,
} from '@/lib/business-days'
import { createAuditLog } from '@/lib/audit'
import { generateTicketNumber, generateTicketQrData } from '@/lib/ticket-generator'
import { calcTarifaApertura } from '@/lib/financial-formulas'
import { z } from 'zod'

const activateSchema = z.object({
  fechaDesembolso: z.string().optional(),
  metodoPago: z.enum(['CASH', 'CARD', 'TRANSFER', 'FINANCIADO']).optional(),
  cashBreakdown: z.array(z.object({
    denominacion: z.number(),
    cantidad: z.number(),
    subtotal: z.number(),
  })).optional(),
  cambioEntregado: z.number().optional(),
  cuentaDestinoId: z.string().uuid().optional(),
  idTransferencia: z.string().optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, id: userId } = session.user

  const rolesPermitidos = ['COORDINADOR', 'GERENTE', 'GERENTE_ZONAL', 'SUPER_ADMIN']
  if (!rolesPermitidos.includes(rol)) {
    return NextResponse.json({ error: 'Sin permisos para activar créditos' }, { status: 403 })
  }

  const activateWhere: Prisma.LoanWhereInput = { id: params.id, companyId: companyId! }
  if (rol === 'COORDINADOR' || rol === 'GERENTE') {
    activateWhere.cobradorId = userId
  } else if (rol === 'GERENTE_ZONAL') {
    const zoneIds = session.user.zonaBranchIds
    if (zoneIds?.length) {
      activateWhere.branchId = { in: zoneIds }
    } else {
      activateWhere.cobradorId = userId
    }
  }

  const loan = await prisma.loan.findFirst({
    where: activateWhere,
    include: {
      client: true,
      branch: { select: { nombre: true } },
      company: { select: { nombre: true } },
      cobrador: { select: { nombre: true } },
    },
  })

  if (!loan) return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })
  if (loan.estado !== 'APPROVED') {
    return NextResponse.json({ error: 'El crédito debe estar aprobado por el Director General antes de activarse' }, { status: 400 })
  }

  // Si el DG solicitó documentación, verificar que los docs requeridos estén subidos
  if (loan.requiereDocumentos) {
    const REQUERIDOS: Record<string, string[]> = {
      SOLIDARIO:  ['SOLICITUD', 'INE_FRENTE', 'INE_REVERSO', 'FOTO'],
      INDIVIDUAL: ['SOLICITUD', 'INE_FRENTE', 'INE_REVERSO', 'COMPROBANTE_DOMICILIO', 'FOTO', 'PAGARE', 'AVAL_INE'],
      AGIL:       ['SOLICITUD', 'INE_FRENTE', 'INE_REVERSO'],
      FIDUCIARIO: ['SOLICITUD', 'INE_FRENTE', 'INE_REVERSO', 'COMPROBANTE_DOMICILIO', 'FOTO', 'CONTRATO', 'PAGARE', 'AVAL_INE'],
    }
    const requeridos = REQUERIDOS[loan.tipo] ?? []
    if (requeridos.length > 0) {
      const subidos = await prisma.loanDocument.findMany({
        where: { loanId: loan.id },
        select: { tipo: true },
      })
      const tiposSubidos = new Set(subidos.map((d) => d.tipo))
      const faltantes = requeridos.filter((t) => !tiposSubidos.has(t))
      if (faltantes.length > 0) {
        const TIPO_LABEL: Record<string, string> = {
          SOLICITUD: 'Solicitud', INE_FRENTE: 'INE frente', INE_REVERSO: 'INE reverso',
          COMPROBANTE_DOMICILIO: 'Comprobante de domicilio', FOTO: 'Fotografía',
          CONTRATO: 'Contrato', PAGARE: 'Pagaré', AVAL_INE: 'INE del aval',
        }
        const nombres = faltantes.map((f) => TIPO_LABEL[f] ?? f).join(', ')
        return NextResponse.json({
          error: `El Director General solicitó documentación antes de activar. Faltan: ${nombres}`,
        }, { status: 400 })
      }
    }
  }

  const body = await req.json().catch(() => ({}))
  const parsed = activateSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos para la activación' }, { status: 400 })
  }

  const data = parsed.data

  const fechaDesembolso = loan.fechaDesembolso
    ?? (data.fechaDesembolso ? new Date(data.fechaDesembolso) : new Date())

  // Gerente verifica transferencia pendiente: no tiene metodoPago, loan ya tiene seguroPendiente
  if (!data.metodoPago && loan.seguroPendiente) {
    // Verificar que el rol pueda verificar transferencias
    const rolesVerificacion = ['GERENTE', 'GERENTE_ZONAL', 'SUPER_ADMIN']
    if (!rolesVerificacion.includes(rol)) {
      return NextResponse.json({ error: 'Sin permisos para verificar transferencias' }, { status: 403 })
    }

    // Marcar el pago de transferencia como verificado
    const pendingPayment = await prisma.payment.findFirst({
      where: { loanId: loan.id, metodoPago: 'TRANSFER', statusTransferencia: 'PENDIENTE' },
      orderBy: { fechaHora: 'desc' },
    })
    if (pendingPayment) {
      await prisma.payment.update({
        where: { id: pendingPayment.id },
        data: { statusTransferencia: 'VERIFICADO', verificadoPorId: userId, verificadoAt: new Date() },
      })
    }

    // Continuar con la activación normal (sin crear otro Payment)
  } else if (!data.metodoPago) {
    return NextResponse.json({ error: 'Método de pago requerido' }, { status: 400 })
  }

  // Determinar el monto de la tarifa de apertura según tipo de préstamo
  const tarifa = calcTarifaApertura(
    loan.tipo as 'SOLIDARIO' | 'INDIVIDUAL' | 'AGIL' | 'FIDUCIARIO',
    Number(loan.capital),
    Number(loan.comision)
  )
  const esFeeSeguro = tarifa.concepto === 'SEGURO'
  const feeMonto = tarifa.monto
  const feeConcepto = esFeeSeguro ? 'Seguro de apertura' : 'Comisión de apertura'

  // Si el pago es por TRANSFER, registrar y esperar verificación (solo en primer llamado, no en verificación)
  if (data.metodoPago === 'TRANSFER') {
    await prisma.$transaction(async (tx) => {
      // Crear registro de Payment para la tarifa
      await tx.payment.create({
        data: {
          loanId: loan.id,
          cobradorId: userId,
          clientId: loan.clientId,
          monto: feeMonto,
          metodoPago: 'TRANSFER',
          cambioEntregado: 0,
          notas: feeConcepto,
          fechaHora: new Date(),
          cuentaDestinoId: data.cuentaDestinoId ?? null,
          idTransferencia: data.idTransferencia ?? null,
          statusTransferencia: 'PENDIENTE',
        },
      })

      await tx.loan.update({
        where: { id: loan.id },
        data: {
          seguro: esFeeSeguro ? feeMonto : undefined,
          seguroMetodoPago: 'TRANSFER',
          seguroPendiente: true,
          fechaDesembolso,
        },
      })
    })

    createAuditLog({
      userId,
      accion: 'REGISTER_ACTIVATION_FEE_TRANSFER',
      tabla: 'Loan',
      registroId: loan.id,
      valoresNuevos: { feeMonto, feeConcepto, metodoPago: 'TRANSFER', seguroPendiente: true },
    })

    return NextResponse.json({
      seguroPendiente: true,
      message: `${feeConcepto} registrado por transferencia. El crédito se activará cuando el gerente verifique.`,
    })
  }

  // FINANCIADO — descontar tarifa del montoReal (que ya incluye descuento de renovación si aplica)
  const esFinanciado = data.metodoPago === 'FINANCIADO'
  const nuevoMontoReal = esFinanciado ? Number(loan.montoReal) - feeMonto : undefined

  // CASH, CARD o FINANCIADO — activación inmediata
  const fechaPrimerPagoRef = loan.fechaPrimerPago ?? null

  let fechas: Date[]
  if (loan.tipo === 'AGIL') {
    fechas = fechaPrimerPagoRef
      ? generarFechasHabilesDesde(fechaPrimerPagoRef, Number(loan.plazo))
      : generarFechasHabiles(fechaDesembolso, Number(loan.plazo))
  } else if (loan.tipo === 'FIDUCIARIO') {
    fechas = generarFechasQuincenales(fechaDesembolso, Number(loan.plazo))
  } else {
    fechas = fechaPrimerPagoRef
      ? generarFechasSemanalesDesde(fechaPrimerPagoRef, Number(loan.plazo))
      : generarFechasSemanales(fechaDesembolso, Number(loan.plazo))
  }

  const montoPorPago =
    loan.tipo === 'AGIL'       ? Number(loan.pagoDiario) :
    loan.tipo === 'FIDUCIARIO' ? Number(loan.pagoQuincenal) :
                                 Number(loan.pagoSemanal)

  // Generar prefijo de sucursal para el ticket
  const branchPrefix = loan.branch.nombre
    .split(' ')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 4)

  const result = await prisma.$transaction(async (tx) => {
    const now = new Date()

    // 1. Crear Payment para la tarifa de apertura (solo si hay pago real — no en verificación ni financiado)
    let payment: { id: string } | null = null
    if (data.metodoPago && data.metodoPago !== 'FINANCIADO') {
      payment = await tx.payment.create({
        data: {
          loanId: loan.id,
          cobradorId: userId,
          clientId: loan.clientId,
          monto: feeMonto,
          metodoPago: data.metodoPago as 'CASH' | 'CARD' | 'TRANSFER',
          cambioEntregado: data.cambioEntregado ?? 0,
          notas: feeConcepto,
          fechaHora: now,
        },
      })

      // 2. Desglose de efectivo (solo CASH)
      if (data.metodoPago === 'CASH' && payment && data.cashBreakdown && data.cashBreakdown.length > 0) {
        await tx.cashBreakdown.createMany({
          data: data.cashBreakdown.map((d) => ({
            paymentId: payment!.id,
            denominacion: d.denominacion,
            cantidad: d.cantidad,
            subtotal: d.subtotal,
          })),
        })
      }
    }

    // 3. Activar el préstamo
    await tx.loan.update({
      where: { id: loan.id },
      data: {
        estado: 'ACTIVE',
        fechaDesembolso,
        ...(esFinanciado ? { montoReal: nuevoMontoReal } : {}),
        ...(esFeeSeguro ? {
          seguro: feeMonto,
          seguroMetodoPago: esFinanciado ? 'CASH' : ((data.metodoPago ?? 'CASH') as 'CASH' | 'CARD' | 'TRANSFER'),
          seguroPendiente: false,
        } : {
          seguroMetodoPago: esFinanciado ? 'CASH' : ((data.metodoPago ?? 'CASH') as 'CASH' | 'CARD' | 'TRANSFER'),
          seguroPendiente: false,
        }),
      },
    })

    // 4. Generar calendario de pagos
    const scheduleData = fechas.map((fecha, idx) => ({
      loanId: loan.id,
      numeroPago: idx + 1,
      fechaVencimiento: fecha,
      montoEsperado: montoPorPago,
      estado: 'PENDING' as const,
    }))
    await tx.paymentSchedule.createMany({ data: scheduleData })

    // 5. Si es renovación anticipada: liquidar crédito anterior
    if (loan.loanOriginalId) {
      const idsFinanciados = Array.isArray(loan.pagosFinanciadosIds)
        ? (loan.pagosFinanciadosIds as string[])
        : null

      if (idsFinanciados && idsFinanciados.length > 0) {
        await tx.paymentSchedule.updateMany({
          where: { id: { in: idsFinanciados } },
          data: { estado: 'FINANCIADO', pagadoAt: new Date() },
        })
      }

      // Los pagos pendientes que NO fueron seleccionados explícitamente para
      // financiar también quedan absorbidos por la renovación. Antes se marcaban
      // como PAID, lo que inflaba la cobranza (aparecían como cobrados sin que
      // entrara dinero). Ahora se marcan FINANCIADO igual que los demás —
      // estado especial que las cobranzas filtran.
      await tx.paymentSchedule.updateMany({
        where: {
          loanId: loan.loanOriginalId,
          estado: { in: ['PENDING', 'OVERDUE', 'PARTIAL'] },
          ...(idsFinanciados?.length ? { id: { notIn: idsFinanciados } } : {}),
        },
        data: { estado: 'FINANCIADO', pagadoAt: new Date() },
      })

      await tx.loan.update({
        where: { id: loan.loanOriginalId },
        data: { estado: 'LIQUIDATED' },
      })
    }

    // 6. Actualizar caja y generar ticket (solo si hay pago real, no financiado)
    let ticket = null
    if (data.metodoPago && data.metodoPago !== 'FINANCIADO' && payment) {
      const fechaCaja = new Date()
      fechaCaja.setHours(0, 0, 0, 0)
      const targetBranchId = session.user.branchId ?? loan.branchId

      await tx.cashRegister.upsert({
        where: { cobradorId_fecha: { cobradorId: userId, fecha: fechaCaja } },
        create: {
          cobradorId: userId,
          branchId: targetBranchId!,
          fecha: fechaCaja,
          cobradoEfectivo: data.metodoPago === 'CASH' ? feeMonto : 0,
          cobradoTarjeta: data.metodoPago === 'CARD' ? feeMonto : 0,
          cobradoTransferencia: 0,
          cambioEntregado: data.cambioEntregado ?? 0,
        },
        update: {
          cobradoEfectivo: data.metodoPago === 'CASH' ? { increment: feeMonto } : undefined,
          cobradoTarjeta: data.metodoPago === 'CARD' ? { increment: feeMonto } : undefined,
          cambioEntregado: data.cambioEntregado ? { increment: data.cambioEntregado } : undefined,
        },
      })

      // Generar ticket solo para CASH (CARD lo genera la terminal)
      if (data.metodoPago === 'CASH' && feeMonto > 0) {
        const year = now.getFullYear()
        const numeroTicket = await generateTicketNumber(branchPrefix, year)
        const qrCode = generateTicketQrData(numeroTicket)

        ticket = await tx.ticket.create({
          data: {
            paymentId: payment.id,
            companyId: companyId!,
            branchId: targetBranchId!,
            numeroTicket,
            impresoPorId: userId,
            qrCode,
          },
        })
      }
    }

    return { payment, ticket }
  })

  createAuditLog({
    userId,
    accion: 'ACTIVATE_LOAN',
    tabla: 'Loan',
    registroId: loan.id,
    valoresNuevos: {
      estado: 'ACTIVE',
      fechaDesembolso: fechaDesembolso.toISOString(),
      feeMonto,
      feeConcepto,
      metodoPago: data.metodoPago,
      ticketNumero: result.ticket?.numeroTicket ?? null,
    },
  })

  return NextResponse.json({
    message: 'Crédito activado — calendario de pagos generado',
    ticket: result.ticket
      ? { id: result.ticket.id, numeroTicket: result.ticket.numeroTicket }
      : null,
  })
}
