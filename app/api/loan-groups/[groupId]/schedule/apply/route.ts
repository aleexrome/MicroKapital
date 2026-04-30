import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { todayMx } from '@/lib/timezone'
import { z } from 'zod'

// Aplicar pago grupal genera un Payment + movimiento de caja por cada
// integrante del grupo en ese numeroPago. Antes solo movía el schedule a
// PAID, lo que rompía la cobranza efectiva (aparecía cobrado sin Payment) y
// el cuadre con caja. Default = TRANSFER (caso típico: depósito grupal).
const schema = z.object({
  numeroPago: z.number().int().positive(),
  metodoPago: z.enum(['CASH', 'CARD', 'TRANSFER']).optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { groupId: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const esOpAdmin = session.user.rol === 'DIRECTOR_GENERAL' || session.user.rol === 'DIRECTOR_COMERCIAL' || session.user.rol === 'SUPER_ADMIN'
  const tienePermiso = esOpAdmin || session.user.permisoAplicarPagos === true
  if (!tienePermiso) {
    return NextResponse.json({ error: 'No autorizado para aplicar pagos grupales' }, { status: 403 })
  }

  const { companyId, id: userId, branchId: userBranchId } = session.user

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const { numeroPago, metodoPago = 'TRANSFER' } = parsed.data

  const loanFilter = esOpAdmin
    ? { loanGroupId: params.groupId, companyId: companyId! }
    : { loanGroupId: params.groupId, companyId: companyId!, branchId: userBranchId! }

  const schedules = await prisma.paymentSchedule.findMany({
    where: {
      numeroPago,
      estado: { notIn: ['PAID', 'ADVANCE'] },
      loan: loanFilter,
    },
    include: {
      loan: {
        select: {
          id: true,
          estado: true,
          clientId: true,
          branchId: true,
          cobradorId: true,
        },
      },
    },
  })

  if (schedules.length === 0) {
    return NextResponse.json(
      { error: 'No hay pagos pendientes para este número de pago en el grupo' },
      { status: 404 }
    )
  }

  const now = new Date()
  const fechaCaja = todayMx()

  const esTransferencia = metodoPago === 'TRANSFER'

  await prisma.$transaction(async (tx) => {
    for (const schedule of schedules) {
      const monto = Number(schedule.montoEsperado)

      // Crear Payment con statusTransferencia=PENDIENTE si es TRANSFER —
      // queda esperando verificación del gerente zonal antes de mover
      // schedule a PAID y sumar a caja. CASH/CARD aplican al instante.
      await tx.payment.create({
        data: {
          loanId:     schedule.loan.id,
          scheduleId: schedule.id,
          cobradorId: schedule.loan.cobradorId,
          clientId:   schedule.loan.clientId,
          monto,
          metodoPago,
          fechaHora:  now,
          notas:      `Aplicado grupal pago ${numeroPago} (${metodoPago})`,
          ...(esTransferencia ? { statusTransferencia: 'PENDIENTE' as const } : {}),
        },
      })

      // TRANSFER → no toca schedule ni caja, espera a verify-transfer
      if (esTransferencia) continue

      // CASH / CARD → flujo directo
      await tx.paymentSchedule.update({
        where: { id: schedule.id },
        data: {
          estado:      'PAID',
          montoPagado: schedule.montoEsperado,
          pagadoAt:    now,
        },
      })

      await tx.cashRegister.upsert({
        where: { cobradorId_fecha: { cobradorId: schedule.loan.cobradorId, fecha: fechaCaja } },
        create: {
          cobradorId:           schedule.loan.cobradorId,
          branchId:             schedule.loan.branchId,
          fecha:                fechaCaja,
          cobradoEfectivo:      metodoPago === 'CASH' ? monto : 0,
          cobradoTarjeta:       metodoPago === 'CARD' ? monto : 0,
          cobradoTransferencia: 0,
        },
        update: {
          cobradoEfectivo: metodoPago === 'CASH' ? { increment: monto } : undefined,
          cobradoTarjeta:  metodoPago === 'CARD' ? { increment: monto } : undefined,
        },
      })

      const pendientes = await tx.paymentSchedule.count({
        where: {
          loanId: schedule.loanId,
          id:     { not: schedule.id },
          estado: { notIn: ['PAID', 'ADVANCE'] },
        },
      })

      if (pendientes === 0 && schedule.loan.estado === 'ACTIVE') {
        await tx.loan.update({
          where: { id: schedule.loan.id },
          data:  { estado: 'LIQUIDATED' },
        })
      }
    }
  })

  createAuditLog({
    userId,
    accion: esTransferencia ? 'DG_APPLY_PAYMENT_GRUPO_PENDING' : 'DG_APPLY_PAYMENT_GRUPO',
    tabla: 'LoanGroup',
    registroId: params.groupId,
    valoresNuevos: {
      numeroPago,
      schedulesAplicados: schedules.length,
      metodoPago,
      ...(esTransferencia ? { statusTransferencia: 'PENDIENTE' } : {}),
    },
  })

  return NextResponse.json({
    message: esTransferencia
      ? `Transferencia grupal registrada en ${schedules.length} integrante(s). Pendiente de verificación del gerente zonal.`
      : `Pago ${numeroPago} aplicado a ${schedules.length} integrante(s)`,
    aplicados: schedules.length,
    pendingVerification: esTransferencia,
  })
}
