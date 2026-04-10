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
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, id: userId } = session.user

  const rolesPermitidos = ['COORDINADOR', 'COBRADOR', 'GERENTE_ZONAL', 'GERENTE', 'SUPER_ADMIN']
  if (!rolesPermitidos.includes(rol)) {
    return NextResponse.json({ error: 'Sin permisos para solicitar renovaciones' }, { status: 403 })
  }

  // Cargar crédito original con su calendario
  const loanOriginal = await prisma.loan.findFirst({
    where: { id, companyId: companyId!, estado: 'ACTIVE' },
    include: {
      schedule: { orderBy: { numeroPago: 'asc' } },
      client: { select: { id: true } },
    },
  })

  if (!loanOriginal) {
    return NextResponse.json({ error: 'Crédito no encontrado o no está activo' }, { status: 404 })
  }

  // Verificar que no tenga ya una renovación pendiente
  const renovacionExistente = await prisma.loan.findFirst({
    where: {
      loanOriginalId: loanOriginal.id,
      estado: { in: ['PENDING_APPROVAL', 'APPROVED'] },
    },
  })
  if (renovacionExistente) {
    return NextResponse.json({
      error: 'Este crédito ya tiene una renovación pendiente de aprobación',
    }, { status: 400 })
  }

  const regla = RENOVACION_REGLAS[loanOriginal.tipo]
  if (!regla) {
    return NextResponse.json({ error: 'Este tipo de crédito no permite renovación anticipada' }, { status: 400 })
  }

  // Verificar elegibilidad: pagos realizados >= umbral
  const pagados = loanOriginal.schedule.filter((s) => s.estado === 'PAID').length
  if (pagados < regla.umbral) {
    return NextResponse.json({
      error: `Se requieren al menos ${regla.umbral} pagos realizados. Actualmente: ${pagados}`,
    }, { status: 400 })
  }

  // Calcular monto financiado (últimos N pagos pendientes que cubre la empresa)
  const montoPorPago =
    loanOriginal.tipo === 'AGIL'       ? Number(loanOriginal.pagoDiario) :
    loanOriginal.tipo === 'FIDUCIARIO' ? Number(loanOriginal.pagoQuincenal) :
                                         Number(loanOriginal.pagoSemanal)

  const montoFinanciado = montoPorPago * regla.financiados

  // Validar body del nuevo crédito
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

  const nuevoCiclo = data.ciclo ?? (loanOriginal.ciclo ?? 1)

  const calc = calcLoan(
    loanOriginal.tipo as 'SOLIDARIO' | 'INDIVIDUAL' | 'AGIL' | 'FIDUCIARIO',
    data.capital,
    tasaInteres,
    {
      ciclo: nuevoCiclo,
      tuvoAtraso: data.tuvoAtraso ?? loanOriginal.tuvoAtraso,
      clienteIrregular: data.clienteIrregular ?? loanOriginal.clienteIrregular,
      tipoGrupo: (data.tipoGrupo ?? loanOriginal.tipoGrupo ?? undefined) as 'REGULAR' | 'RESCATE' | undefined,
    }
  )

  // El monto financiado se descuenta del monto real entregado al cliente
  const montoRealAjustado = Math.max(0, calc.montoReal - montoFinanciado)

  // Crear nuevo crédito en PENDING_APPROVAL
  // El crédito anterior SIGUE ACTIVO — se liquida cuando el Director General apruebe
  const result = await prisma.$transaction(async (tx) => {
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
        montoReal: montoRealAjustado,
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
        // Vínculo con el crédito anterior
        loanOriginalId: loanOriginal.id,
        descuentoRenovacion: montoFinanciado,
        notas: `Renovación anticipada — financia ${regla.financiados} pagos del crédito anterior ($${montoFinanciado.toFixed(2)})`,
      },
    })

    await tx.loanApproval.create({
      data: {
        loanId: nuevoLoan.id,
        solicitadoPorId: userId,
        estado: 'PENDING',
        notas: `Renovación anticipada desde crédito ${loanOriginal.id}. Financia $${montoFinanciado.toFixed(2)}.`,
      },
    })

    return nuevoLoan
  })

  createAuditLog({
    userId,
    accion: 'REQUEST_RENEWAL',
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
    message: 'Renovación solicitada — pendiente de aprobación por el Director General',
    data: {
      nuevoLoanId: result.id,
      montoFinanciado,
      montoRealEntregado: montoRealAjustado,
    },
  }, { status: 201 })
}
