import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { calcLoan } from '@/lib/financial-formulas'
import { createAuditLog } from '@/lib/audit'
import { crearNotificacion, getGerentesZonalesIds } from '@/lib/notifications'
import { parseMxYMD } from '@/lib/timezone'
import { z } from 'zod'

const approveSchema = z.object({
  notas: z.string().optional(),
  avalOverride: z.boolean().optional(),
  requiereDocumentos: z.boolean().optional(),
  contrapropuesta: z.object({
    capital: z.number().positive(),
    fechaDesembolso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)').optional(),
    fechaPrimerPago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)').optional(),
  }).optional(),
  // SOLIDARIO: si la UI marca a este integrante como coordinadora del
  // grupo, se setea Loan.esCoordinadora = true (los demás false). El
  // contrato y la activación grupal usan este flag como ancla.
  esCoordinadora: z.boolean().optional(),
  // Día (LUNES..DOMINGO) y hora límite (HH:MM 24h) de cobro definidos por
  // DG. Se plasman en el contrato. Si no llegan, se conservan los valores
  // actuales del Loan (que pueden venir del backfill desde BranchConfig).
  diaCobro: z.enum(['LUNES','MARTES','MIERCOLES','JUEVES','VIERNES','SABADO','DOMINGO']).optional(),
  horaLimiteCobro: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Formato HH:MM (24h)').optional(),
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
  const avalOverride = parsed.success ? parsed.data.avalOverride : undefined
  const contrapropuesta = parsed.success ? parsed.data.contrapropuesta : undefined
  const requiereDocumentos = parsed.success ? (parsed.data.requiereDocumentos ?? false) : false
  const esCoordinadora = parsed.success && loan.tipo === 'SOLIDARIO' ? (parsed.data.esCoordinadora ?? false) : false
  const diaCobro = parsed.success ? parsed.data.diaCobro : undefined
  const horaLimiteCobro = parsed.success ? parsed.data.horaLimiteCobro : undefined

  // Build updated financial fields if Director makes a counteroffer
  let loanFieldUpdates: Record<string, unknown> = {}
  let esContrapropuesta = false

  if (contrapropuesta) {
    const calc = calcLoan(
      loan.tipo as 'SOLIDARIO' | 'INDIVIDUAL' | 'AGIL' | 'FIDUCIARIO',
      contrapropuesta.capital,
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
      // parseMxYMD ancla la fecha a las 06:00 UTC (medianoche CDMX). Si se
      // usara new Date('YYYY-MM-DD') quedaría a medianoche UTC, que en CDMX
      // es el día ANTERIOR — y el calendario de cobros se recorría un día
      // (los pagos de ágil terminaban cayendo en sábado/domingo).
      ...(contrapropuesta.fechaDesembolso ? { fechaDesembolso: parseMxYMD(contrapropuesta.fechaDesembolso) } : {}),
      ...(contrapropuesta.fechaPrimerPago ? { fechaPrimerPago: parseMxYMD(contrapropuesta.fechaPrimerPago) } : {}),
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
        ...(loan.tipo === 'SOLIDARIO' ? { esCoordinadora } : {}),
        ...(diaCobro ? { diaCobro } : {}),
        ...(horaLimiteCobro ? { horaLimiteCobro } : {}),
        ...loanFieldUpdates,
      },
    })

    // Si este loan se marcó como coordinadora de un grupo SOLIDARIO,
    // limpiar el flag en cualquier otro integrante del mismo grupo
    // (mismo ciclo: original vs renovación se diferencia por loanOriginalId).
    if (loan.tipo === 'SOLIDARIO' && esCoordinadora && loan.loanGroupId) {
      const esRenovacionLoan = loan.loanOriginalId !== null
      await tx.loan.updateMany({
        where: {
          loanGroupId: loan.loanGroupId,
          id: { not: loan.id },
          ...(esRenovacionLoan
            ? { loanOriginalId: { not: null } }
            : { loanOriginalId: null }),
        },
        data: { esCoordinadora: false },
      })
    }

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

  // Log aval override separately for traceability
  if (avalOverride) {
    createAuditLog({
      userId,
      accion: 'AVAL_OVERRIDE',
      tabla: 'Loan',
      registroId: loan.id,
      valoresNuevos: {
        motivo: 'Aprobación con aval en mora — consciente del riesgo',
        aprobadoPorId: userId,
      },
    })
  }

  // Notificar a la cobradora + GZ del branch sobre la decisión del DG.
  try {
    const [clienteRow, gerentes] = await Promise.all([
      prisma.client.findUnique({ where: { id: loan.clientId }, select: { nombreCompleto: true } }),
      getGerentesZonalesIds(prisma, companyId!, loan.branchId),
    ])
    const clienteNombre = clienteRow?.nombreCompleto ?? 'cliente'
    const destinatarios = [loan.cobradorId, ...gerentes]

    if (esContrapropuesta) {
      const c = contrapropuesta!
      await crearNotificacion(prisma, {
        companyId: companyId!,
        destinatariosIds: destinatarios,
        tipo: 'SOLICITUD_CONTRAPROPUESTA',
        nivel: 'IMPORTANTE',
        titulo: 'Contrapropuesta del Director General',
        mensaje: `${clienteNombre}: capital $${Number(c.capital).toFixed(2)}${c.fechaDesembolso ? `, desembolso ${c.fechaDesembolso}` : ''}. Visita al cliente para presentar las nuevas condiciones.`,
        loanId: loan.id,
        clientId: loan.clientId,
      })
    } else {
      await crearNotificacion(prisma, {
        companyId: companyId!,
        destinatariosIds: destinatarios,
        tipo: 'SOLICITUD_APROBADA',
        nivel: 'IMPORTANTE',
        titulo: 'Solicitud aprobada',
        mensaje: `${clienteNombre} — aprobada por el Director General. Pendiente de activación.`,
        loanId: loan.id,
        clientId: loan.clientId,
      })
    }
  } catch (e) {
    console.error('[approve] notif failed:', e)
  }

  const message = esContrapropuesta
    ? 'Contrapropuesta registrada — el coordinador visitará al cliente para presentar las nuevas condiciones'
    : esRenovacion
    ? 'Renovación aprobada — pendiente de activación (el crédito anterior se liquidará al activar)'
    : 'Crédito aprobado — pendiente de activación por el coordinador'

  return NextResponse.json({ message })
}
