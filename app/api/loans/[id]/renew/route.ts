import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { calcLoan } from '@/lib/financial-formulas'
import { createAuditLog } from '@/lib/audit'
import { z } from 'zod'

const renewSchema = z.object({
  capital: z.number().positive(),
  tipo: z.enum(['SOLIDARIO', 'INDIVIDUAL', 'AGIL', 'FIDUCIARIO']).optional(),
  // Array vacío = el coordinador eligió financiar 0 pagos. Si el
  // campo no llega, el handler cae a la regla automática (últimos N).
  pagosFinanciadosIds: z.array(z.string()).optional(),
  notas: z.string().optional(),
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
    return NextResponse.json({ error: 'Sin permisos para solicitar renovaciones' }, { status: 403 })
  }

  // Cargar crédito original con su calendario completo
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

  // Validar body
  const body = await req.json()
  const parsed = renewSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const data = parsed.data

  // Calcular monto financiado
  // — Si el coordinador seleccionó pagos específicos (incluso array
  //   vacío = no financiar nada), respetamos la selección.
  // — Si el campo no viene del cliente (compatibilidad), caemos a la
  //   regla automática (últimos N pagos pendientes).
  let montoFinanciado: number
  let pagosFinanciadosIds: string[] | null = null

  const pagosPendientes = loanOriginal.schedule.filter(
    (s) => s.estado === 'PENDING' || s.estado === 'OVERDUE' || s.estado === 'PARTIAL'
  )

  if (Array.isArray(data.pagosFinanciadosIds)) {
    const loanPendingIds = new Set(pagosPendientes.map((s) => s.id))
    const invalidos = data.pagosFinanciadosIds.filter((id) => !loanPendingIds.has(id))
    if (invalidos.length > 0) {
      return NextResponse.json(
        { error: 'Uno o más pagos seleccionados no corresponden a este crédito' },
        { status: 400 }
      )
    }
    montoFinanciado = pagosPendientes
      .filter((s) => data.pagosFinanciadosIds!.includes(s.id))
      .reduce((sum, s) => sum + Number(s.montoEsperado), 0)
    pagosFinanciadosIds = data.pagosFinanciadosIds
  } else {
    // Retrocompatibilidad: auto-financiar últimos N pagos
    const montoPorPago =
      loanOriginal.tipo === 'AGIL'       ? Number(loanOriginal.pagoDiario) :
      loanOriginal.tipo === 'FIDUCIARIO' ? Number(loanOriginal.pagoQuincenal) :
                                           Number(loanOriginal.pagoSemanal)
    montoFinanciado = montoPorPago * regla.financiados
    // Tomar los primeros N pagos pendientes como financiados
    pagosFinanciadosIds = pagosPendientes.slice(0, regla.financiados).map((s) => s.id)
  }

  // Tipo del nuevo crédito (puede cambiar)
  const nuevoTipo = data.tipo ?? loanOriginal.tipo

  // Calcular el nuevo crédito
  let tasaInteres = data.tasaInteres
  if (!tasaInteres && nuevoTipo === 'FIDUCIARIO') {
    const setting = await prisma.companySetting.findFirst({
      where: { companyId: companyId!, clave: 'tasa_fiduciario' },
    })
    tasaInteres = setting ? parseFloat(setting.valor) : 0.30
  }

  const nuevoCiclo = data.ciclo ?? (loanOriginal.ciclo ?? 1)

  const calc = calcLoan(
    nuevoTipo as 'SOLIDARIO' | 'INDIVIDUAL' | 'AGIL' | 'FIDUCIARIO',
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

  const pagosFinanciadosCount = pagosFinanciadosIds?.length ?? 0
  const notasLoan = data.notas
    ?? `Renovación anticipada — financia ${pagosFinanciadosCount} pago${pagosFinanciadosCount !== 1 ? 's' : ''} del crédito anterior ($${montoFinanciado.toFixed(2)})`

  // Crear nuevo crédito en PENDING_APPROVAL
  // El crédito anterior SIGUE ACTIVO — se liquida cuando el coordinador active el nuevo crédito
  const result = await prisma.$transaction(async (tx) => {
    const nuevoLoan = await tx.loan.create({
      data: {
        companyId: companyId!,
        branchId: loanOriginal.branchId,
        cobradorId: loanOriginal.cobradorId,
        clientId: loanOriginal.client.id,
        tipo: nuevoTipo,
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
        pagosFinanciadosIds: pagosFinanciadosIds,
        notas: notasLoan,
      },
    })

    await tx.loanApproval.create({
      data: {
        loanId: nuevoLoan.id,
        solicitadoPorId: userId,
        estado: 'PENDING',
        notas: `Renovación anticipada desde crédito ${loanOriginal.id}. Financia $${montoFinanciado.toFixed(2)} (${pagosFinanciadosCount} pago${pagosFinanciadosCount !== 1 ? 's' : ''}).`,
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
      nuevoTipo,
      montoFinanciado,
      pagosFinanciadosIds,
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
