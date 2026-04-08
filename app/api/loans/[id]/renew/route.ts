import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { calcLoan } from '@/lib/financial-formulas'
import { createAuditLog } from '@/lib/audit'
import { z } from 'zod'

const renewSchema = z.object({
  capital: z.number().positive(),
  tasaInteres: z.number().positive().optional(),
  ciclo: z.number().int().min(1).optional(),
  tuvoAtraso: z.boolean().optional(),
  tipoGrupo: z.enum(['REGULAR', 'RESCATE']).optional(),
  clienteIrregular: z.boolean().optional(),
})

// Reglas de renovación anticipada por producto
const RENOVACION_REGLAS: Record<string, { umbral: number; financiados: number }> = {
  SOLIDARIO:  { umbral: 6,  financiados: 2 },  // desde pago 6, financia 7 y 8
  INDIVIDUAL: { umbral: 9,  financiados: 3 },  // desde pago 9, financia 10, 11 y 12
  AGIL:       { umbral: 20, financiados: 4 },  // desde pago 20, financia 21-24
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, id: userId } = session.user

  const rolesPermitidos = ['COORDINADOR', 'COBRADOR', 'GERENTE_ZONAL', 'GERENTE', 'SUPER_ADMIN']
  if (!rolesPermitidos.includes(rol)) {
    return NextResponse.json({ error: 'Sin permisos para renovar créditos' }, { status: 403 })
  }

  // Cargar el crédito original con su calendario
  const loanOriginal = await prisma.loan.findFirst({
    where: { id: params.id, companyId: companyId!, estado: 'ACTIVE' },
    include: {
      schedule: { orderBy: { numeroPago: 'asc' } },
      client: { select: { id: true } },
    },
  })

  if (!loanOriginal) {
    return NextResponse.json({ error: 'Crédito no encontrado o no está activo' }, { status: 404 })
  }

  const regla = RENOVACION_REGLAS[loanOriginal.tipo]
  if (!regla) {
    return NextResponse.json({ error: 'Este tipo de crédito no permite renovación anticipada' }, { status: 400 })
  }

  // Verificar elegibilidad: pagos realizados >= umbral, todos PAID
  const pagados = loanOriginal.schedule.filter((s) => s.estado === 'PAID').length
  if (pagados < regla.umbral) {
    return NextResponse.json({
      error: `Se requieren al menos ${regla.umbral} pagos realizados. Actualmente: ${pagados}`,
    }, { status: 400 })
  }

  // Calcular monto financiado (pagos restantes que cubre la empresa)
  const montoPorPago =
    loanOriginal.tipo === 'AGIL'       ? Number(loanOriginal.pagoDiario) :
    loanOriginal.tipo === 'FIDUCIARIO' ? Number(loanOriginal.pagoQuincenal) :
                                         Number(loanOriginal.pagoSemanal)

  const montoFinanciado = montoPorPago * regla.financiados

  // Validar el body del nuevo crédito
  const body = await req.json()
  const parsed = renewSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const data = parsed.data

  // Calcular el nuevo crédito
  let tasaInteres = data.tasaInteres
  if (!tasaInteres && loanOriginal.tipo === 'FIDUCIARIO') {
    const setting = await prisma.companySetting.findFirst({
      where: { companyId: companyId!, clave: 'tasa_fiduciario' },
    })
    tasaInteres = setting ? parseFloat(setting.valor) : 0.30
  }

  const nuevoCiclo = (data.ciclo ?? loanOriginal.ciclo ?? 1)

  const calc = calcLoan(loanOriginal.tipo as 'SOLIDARIO' | 'INDIVIDUAL' | 'AGIL' | 'FIDUCIARIO', data.capital, tasaInteres, {
    ciclo: nuevoCiclo,
    tuvoAtraso: data.tuvoAtraso ?? loanOriginal.tuvoAtraso,
    clienteIrregular: data.clienteIrregular ?? loanOriginal.clienteIrregular,
    tipoGrupo: (data.tipoGrupo ?? loanOriginal.tipoGrupo ?? undefined) as 'REGULAR' | 'RESCATE' | undefined,
  })

  // El monto financiado se descuenta del monto real entregado al cliente
  const montoRealAjustado = Math.max(0, calc.montoReal - montoFinanciado)

  const result = await prisma.$transaction(async (tx) => {
    // 1. Liquidar el crédito original: marcar pagos pendientes como PAID (financiados)
    const schedulesPendientes = loanOriginal.schedule.filter(
      (s) => s.estado === 'PENDING' || s.estado === 'OVERDUE' || s.estado === 'PARTIAL'
    )

    for (const sched of schedulesPendientes) {
      await tx.paymentSchedule.update({
        where: { id: sched.id },
        data: { estado: 'PAID', pagadoAt: new Date(), montoPagado: sched.montoEsperado },
      })
    }

    // 2. Marcar crédito original como LIQUIDADO
    await tx.loan.update({
      where: { id: loanOriginal.id },
      data: { estado: 'LIQUIDATED' },
    })

    // 3. Crear el nuevo crédito en PENDING_APPROVAL con el monto ajustado
    const nuevoLoan = await tx.loan.create({
      data: {
        companyId: companyId!,
        branchId: loanOriginal.branchId,
        cobradorId: loanOriginal.cobradorId,
        clientId: loanOriginal.client.id,
        tipo: loanOriginal.tipo,
        estado: 'PENDING_APPROVAL',
        capital: calc.capital,
        comision: calc.comision,
        montoReal: montoRealAjustado,  // ← ajustado por financiamiento
        tasaInteres: calc.tasaInteres,
        interes: calc.interes,
        totalPago: calc.totalPago,
        pagoSemanal: calc.pagoSemanal ?? null,
        pagoDiario: calc.pagoDiario ?? null,
        pagoQuincenal: calc.pagoQuincenal ?? null,
        plazo: calc.plazo,
        ciclo: nuevoCiclo,
        tuvoAtraso: data.tuvoAtraso ?? loanOriginal.tuvoAtraso,
        clienteIrregular: data.clienteIrregular ?? loanOriginal.clienteIrregular,
        tipoGrupo: data.tipoGrupo ?? loanOriginal.tipoGrupo ?? null,
        notas: `Renovación anticipada. Financia $${montoFinanciado.toFixed(2)} del crédito anterior (${regla.financiados} pagos).`,
      },
    })

    // 4. Crear registro de aprobación para el nuevo crédito
    await tx.loanApproval.create({
      data: {
        loanId: nuevoLoan.id,
        solicitadoPorId: userId,
        estado: 'PENDING',
        notas: `Renovación anticipada desde crédito ${loanOriginal.id}`,
      },
    })

    return nuevoLoan
  })

  createAuditLog({
    userId,
    accion: 'RENEW_LOAN',
    tabla: 'Loan',
    registroId: result.id,
    valoresNuevos: {
      loanOriginalId: loanOriginal.id,
      montoFinanciado,
      newCapital: data.capital,
      montoRealAjustado,
    },
  })

  return NextResponse.json({
    message: 'Renovación creada exitosamente',
    data: {
      nuevoLoanId: result.id,
      montoFinanciado,
      montoRealEntregado: montoRealAjustado,
    },
  }, { status: 201 })
}
