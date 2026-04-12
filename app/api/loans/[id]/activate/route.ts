import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { type Prisma } from '@prisma/client'
import { generarFechasSemanales, generarFechasHabiles, generarFechasQuincenales } from '@/lib/business-days'
import { createAuditLog } from '@/lib/audit'
import { z } from 'zod'

const activateSchema = z.object({
  fechaDesembolso:  z.string().optional(),
  seguro:           z.number().optional(),
  seguroMetodoPago: z.enum(['CASH', 'TRANSFER']).optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, id: userId } = session.user

  const rolesPermitidos = ['COORDINADOR', 'COBRADOR', 'GERENTE_ZONAL', 'GERENTE', 'SUPER_ADMIN']
  if (!rolesPermitidos.includes(rol)) {
    return NextResponse.json({ error: 'Sin permisos para activar créditos' }, { status: 403 })
  }

  // Scope by ownership — coordinator can only activate their own loans
  const activateWhere: Prisma.LoanWhereInput = { id: params.id, companyId: companyId! }
  if (rol === 'COORDINADOR' || rol === 'COBRADOR') {
    activateWhere.cobradorId = userId
  } else if (rol === 'GERENTE') {
    const branchIds = session.user.zonaBranchIds?.length
      ? session.user.zonaBranchIds
      : session.user.branchId ? [session.user.branchId] : null
    if (branchIds?.length) activateWhere.branchId = { in: branchIds }
  } else if (rol === 'GERENTE_ZONAL') {
    const zoneIds = session.user.zonaBranchIds
    if (zoneIds?.length) activateWhere.branchId = { in: zoneIds }
  }

  const loan = await prisma.loan.findFirst({ where: activateWhere })

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
  const fechaDesembolso = parsed.success && parsed.data.fechaDesembolso
    ? new Date(parsed.data.fechaDesembolso)
    : new Date()

  const seguroMonto    = parsed.success ? (parsed.data.seguro ?? null) : null
  const seguroMetodo   = parsed.success ? (parsed.data.seguroMetodoPago ?? null) : null

  // Si el seguro se pagó por transferencia, registrar y esperar verificación del gerente
  const esperaVerificacion = seguroMonto && seguroMonto > 0 && seguroMetodo === 'TRANSFER'

  if (esperaVerificacion) {
    // Guardar info del seguro pero mantener el préstamo en APPROVED
    await prisma.loan.update({
      where: { id: loan.id },
      data: {
        seguro:          seguroMonto,
        seguroMetodoPago: 'TRANSFER',
        seguroPendiente:  true,
        fechaDesembolso,  // guardar la fecha propuesta
      },
    })

    createAuditLog({
      userId,
      accion: 'REGISTER_SEGURO_TRANSFER',
      tabla: 'Loan',
      registroId: loan.id,
      valoresNuevos: { seguro: seguroMonto, seguroMetodoPago: 'TRANSFER', seguroPendiente: true },
    })

    return NextResponse.json({
      seguroPendiente: true,
      message: 'Seguro registrado. El crédito se activará cuando el gerente verifique la transferencia.',
    })
  }

  // Activación normal (seguro en efectivo o sin seguro)
  let fechas: Date[]
  if (loan.tipo === 'AGIL') {
    fechas = generarFechasHabiles(fechaDesembolso, Number(loan.plazo))
  } else if (loan.tipo === 'FIDUCIARIO') {
    fechas = generarFechasQuincenales(fechaDesembolso, Number(loan.plazo))
  } else {
    fechas = generarFechasSemanales(fechaDesembolso, Number(loan.plazo))
  }

  const montoPorPago =
    loan.tipo === 'AGIL'       ? Number(loan.pagoDiario) :
    loan.tipo === 'FIDUCIARIO' ? Number(loan.pagoQuincenal) :
                                 Number(loan.pagoSemanal)

  await prisma.$transaction(async (tx) => {
    await tx.loan.update({
      where: { id: loan.id },
      data: {
        estado: 'ACTIVE',
        fechaDesembolso,
        ...(seguroMonto && seguroMonto > 0 ? {
          seguro:           seguroMonto,
          seguroMetodoPago: 'CASH',
          seguroPendiente:  false,
        } : {}),
      },
    })

    const scheduleData = fechas.map((fecha, idx) => ({
      loanId: loan.id,
      numeroPago: idx + 1,
      fechaVencimiento: fecha,
      montoEsperado: montoPorPago,
      estado: 'PENDING' as const,
    }))

    await tx.paymentSchedule.createMany({ data: scheduleData })
  })

  createAuditLog({
    userId,
    accion: 'ACTIVATE_LOAN',
    tabla: 'Loan',
    registroId: loan.id,
    valoresNuevos: {
      estado: 'ACTIVE',
      fechaDesembolso: fechaDesembolso.toISOString(),
      seguro: seguroMonto,
      seguroMetodoPago: seguroMonto ? 'CASH' : null,
    },
  })

  return NextResponse.json({ message: 'Crédito activado — calendario de pagos generado' })
}
