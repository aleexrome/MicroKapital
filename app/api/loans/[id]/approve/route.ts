import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { calcLoan } from '@/lib/financial-formulas'
import { createAuditLog } from '@/lib/audit'
import { z } from 'zod'

const approveSchema = z.object({
  notas: z.string().optional(),
  requiereDocumentos: z.boolean().optional(),
  contrapropuesta: z.object({
    capital: z.number().positive(),
    tasaInteres: z.number().positive().optional(),
    fechaDesembolso: z.string().optional(),
    fechaPrimerPago: z.string().optional(),
  }).optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, id: userId } = session.user

  if (rol !== 'DIRECTOR_GENERAL' && rol !== 'SUPER_ADMIN') {
    return NextResponse.json(
      { error: 'Sin permisos — solo el Director General puede aprobar créditos' },
      { status: 403 }
    )
  }

  const loan = await prisma.loan.findFirst({
    where: { id: params.id, companyId: companyId! },
    include: {
      loanOriginal: {
        include: {
          schedule: {
            where: { estado: { in: ['PENDING', 'OVERDUE', 'PARTIAL'] } },
          },
        },
      },
    },
  })

  if (!loan) return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })
  if (loan.estado !== 'PENDING_APPROVAL') {
    return NextResponse.json({ error: 'El préstamo no está pendiente de aprobación' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = approveSchema.safeParse(body)
  const notas = parsed.success ? parsed.data.notas : undefined
  const contrapropuesta = parsed.success ? parsed.data.contrapropuesta : undefined
  const requiereDocumentos = parsed.success ? (parsed.data.requiereDocumentos ?? false) : false

  // Build updated financial fields if Director makes a counteroffer
  let loanFieldUpdates: Record<string, unknown> = {}
  let esContrapropuesta = false

  if (contrapropuesta) {
    const calc = calcLoan(
      loan.tipo as 'SOLIDARIO' | 'INDIVIDUAL' | 'AGIL' | 'FIDUCIARIO',
      contrapropuesta.capital,
      contrapropuesta.tasaInteres,
      {
        ciclo: loan.ciclo ?? 1,
        tuvoAtraso: loan.tuvoAtraso,
        clienteIrregular: loan.clienteIrregular,
        tipoGrupo: (loan.tipoGrupo ?? undefined) as 'REGULAR' | 'RESCATE' | undefined,
      }
    )

    // If it was a renewal, adjust montoReal for the financed discount
    let montoReal = calc.montoReal
    if (loan.descuentoRenovacion) {
      montoReal = Math.max(0, calc.montoReal - Number(loan.descuentoRenovacion))
    }

    loanFieldUpdates = {
      capital: calc.capital,
      comision: calc.comision,
      montoReal,
      tasaInteres: calc.tasaInteres,
      interes: calc.interes,
      totalPago: calc.totalPago,
      pagoSemanal: calc.pagoSemanal ?? null,
      pagoDiario: calc.pagoDiario ?? null,
      pagoQuincenal: calc.pagoQuincenal ?? null,
      plazo: calc.plazo,
      ...(contrapropuesta.fechaDesembolso ? { fechaDesembolso: new Date(contrapropuesta.fechaDesembolso) } : {}),
      ...(contrapropuesta.fechaPrimerPago ? { fechaPrimerPago: new Date(contrapropuesta.fechaPrimerPago) } : {}),
    }
    esContrapropuesta = true
  }

  await prisma.$transaction(async (tx) => {
    // 1. Approve the new loan (with optional recalculated fields)
    await tx.loan.update({
      where: { id: loan.id },
      data: {
        estado: 'APPROVED',
        aprobadoPorId: userId,
        aprobadoAt: new Date(),
        notas: notas ?? null,
        requiereDocumentos,
        ...loanFieldUpdates,
      },
    })

    await tx.loanApproval.updateMany({
      where: { loanId: loan.id, estado: 'PENDING' },
      data: {
        estado: 'APPROVED',
        revisadoPorId: userId,
        revisadoAt: new Date(),
        notas: notas ?? (esContrapropuesta ? `Contrapropuesta: capital ajustado a $${contrapropuesta!.capital}` : null),
      },
    })

    // Nota: si es renovación anticipada, el crédito original se liquida al ACTIVAR el nuevo crédito
    // (no al aprobar), para que los pagos financiados queden marcados con estado FINANCIADO
  })

  const esRenovacion = !!loan.loanOriginalId

  createAuditLog({
    userId,
    accion: esContrapropuesta ? 'COUNTEROFFER_LOAN' : 'APPROVE_LOAN',
    tabla: 'Loan',
    registroId: loan.id,
    valoresNuevos: {
      estado: 'APPROVED',
      aprobadoPorId: userId,
      ...(esContrapropuesta ? { contrapropuesta } : {}),
      ...(esRenovacion ? { loanOriginalLiquidado: loan.loanOriginalId } : {}),
    },
  })

  const message = esContrapropuesta
    ? 'Contrapropuesta registrada — el coordinador visitará al cliente para presentar las nuevas condiciones'
    : esRenovacion
    ? 'Renovación aprobada — pendiente de activación (el crédito anterior se liquidará al activar)'
    : 'Crédito aprobado — pendiente de activación por el coordinador'

  return NextResponse.json({ message })
}
