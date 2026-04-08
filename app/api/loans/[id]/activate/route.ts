import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { generarFechasSemanales, generarFechasHabiles, generarFechasQuincenales } from '@/lib/business-days'
import { createAuditLog } from '@/lib/audit'
import { z } from 'zod'

const activateSchema = z.object({
  fechaDesembolso: z.string().optional(), // ISO date string; si no se pasa, usa hoy
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, id: userId } = session.user

  // Coordinador y Gerente Zonal son quienes activan; también Super Admin
  const rolesPermitidos = ['COORDINADOR', 'COBRADOR', 'GERENTE_ZONAL', 'GERENTE', 'SUPER_ADMIN']
  if (!rolesPermitidos.includes(rol)) {
    return NextResponse.json({ error: 'Sin permisos para activar créditos' }, { status: 403 })
  }

  const loan = await prisma.loan.findFirst({
    where: { id: params.id, companyId: companyId! },
  })

  if (!loan) return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })
  if (loan.estado !== 'APPROVED') {
    return NextResponse.json({ error: 'El crédito debe estar aprobado por el Director General antes de activarse' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = activateSchema.safeParse(body)
  const fechaDesembolso = parsed.success && parsed.data.fechaDesembolso
    ? new Date(parsed.data.fechaDesembolso)
    : new Date()

  // Generar calendario de pagos según el tipo de crédito
  let fechas: Date[]
  if (loan.tipo === 'AGIL') {
    fechas = generarFechasHabiles(fechaDesembolso, Number(loan.plazo))
  } else if (loan.tipo === 'FIDUCIARIO') {
    fechas = generarFechasQuincenales(fechaDesembolso, Number(loan.plazo))
  } else {
    // SOLIDARIO e INDIVIDUAL: semanal
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
    valoresNuevos: { estado: 'ACTIVE', fechaDesembolso: fechaDesembolso.toISOString() },
  })

  return NextResponse.json({ message: 'Crédito activado — calendario de pagos generado' })
}
