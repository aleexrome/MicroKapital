import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { todayMx } from '@/lib/timezone'
import { z } from 'zod'

// El "aplicar pago" lo usa Dirección/Op. Admin para registrar cobros que
// llegaron por transferencia (default). Antes esto solo movía el schedule
// a PAID y no creaba Payment ni movimiento en caja, por lo que la cobranza
// efectiva e ingresos a caja no cuadraban. Ahora siempre se genera Payment
// y se actualiza CashRegister para que la cobranza efectiva refleje únicamente
// lo respaldado por un movimiento real.
const schema = z.object({
  metodoPago: z.enum(['CASH', 'CARD', 'TRANSFER']).optional(),
}).optional()

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; scheduleId: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const esOpAdmin = session.user.rol === 'DIRECTOR_GENERAL' || session.user.rol === 'DIRECTOR_COMERCIAL' || session.user.rol === 'SUPER_ADMIN'
  const { companyId, id: userId, branchId: userBranchId } = session.user

  // Leer permiso directo de BD para evitar problemas de caché en el JWT
  const userPermisos = await prisma.user.findUnique({
    where: { id: userId },
    select: { permisoAplicarPagos: true },
  })
  const tienePermiso = esOpAdmin || userPermisos?.permisoAplicarPagos === true
  if (!tienePermiso) {
    return NextResponse.json({ error: 'No autorizado para aplicar pagos' }, { status: 403 })
  }

  // Parseo del cuerpo (opcional). Default = TRANSFER porque el caso de uso
  // típico es la dirección registrando un depósito/transferencia recibido.
  let metodoPago: 'CASH' | 'CARD' | 'TRANSFER' = 'TRANSFER'
  try {
    const raw = await req.json().catch(() => null)
    if (raw) {
      const parsed = schema.safeParse(raw)
      if (parsed.success && parsed.data?.metodoPago) {
        metodoPago = parsed.data.metodoPago
      }
    }
  } catch {
    // body opcional — ignoramos errores de parseo y seguimos con TRANSFER
  }

  // Usuarios con permiso: solo pueden actuar sobre préstamos de su sucursal
  const loanFilter = esOpAdmin
    ? { companyId: companyId! }
    : { companyId: companyId!, ...(userBranchId ? { branchId: userBranchId } : {}) }

  const schedule = await prisma.paymentSchedule.findFirst({
    where: {
      id: params.scheduleId,
      loanId: params.id,
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

  if (!schedule) {
    return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })
  }
  if (schedule.estado === 'PAID' || schedule.estado === 'ADVANCE') {
    return NextResponse.json({ error: 'Este pago ya está marcado como pagado' }, { status: 400 })
  }

  // `now` (UTC) para timestamps universales: Payment.fechaHora, verificadoAt.
  // `pagadoAtMx` (06:00 UTC del día CDMX) para PaymentSchedule.pagadoAt, que
  // representa fecha calendario y se cruza con rangos semanales en CDMX.
  const now = new Date()
  const pagadoAtMx = todayMx()
  const monto = Number(schedule.montoEsperado)
  // El movimiento de caja se registra contra el cobrador titular del crédito
  // (no contra el director que aplica), así la caja diaria del cobrador
  // refleja todo lo cobrado en su ruta — efectivo, tarjeta y transferencias.
  const cobradorRegistroId = schedule.loan.cobradorId
  const fechaCaja = todayMx()

  const snapshotAntes = {
    estado: schedule.estado,
    montoPagado: schedule.montoPagado,
    pagadoAt: schedule.pagadoAt,
    loanEstado: schedule.loan.estado,
  }

  await prisma.$transaction(async (tx) => {
    const esTransferencia = metodoPago === 'TRANSFER'

    // 1. Crear el Payment de respaldo.
    //
    //    Para TRANSFER aplicado vía este endpoint: queda VERIFICADO directo
    //    porque quien usa /apply es DG/DC/SA o un usuario con
    //    permisoAplicarPagos (Cristina) — todos ellos son la autoridad
    //    final para validar transferencias. El flujo de "Validar en
    //    /transferencias" es para cobros capturados por cobradores
    //    regulares, no para los aplicados por dirección.
    await tx.payment.create({
      data: {
        loanId:     schedule.loan.id,
        scheduleId: schedule.id,
        cobradorId: cobradorRegistroId,
        clientId:   schedule.loan.clientId,
        monto,
        metodoPago,
        fechaHora:  now,
        notas:      `Aplicado por ${esOpAdmin ? 'dirección' : 'op. admin'} (${metodoPago})`,
        ...(esTransferencia ? {
          statusTransferencia: 'VERIFICADO' as const,
          verificadoPorId:     userId,
          verificadoAt:        now,
        } : {}),
      },
    })

    // 2. Schedule pasa a PAID y caja del cobrador suma — siempre, porque
    //    quien aplicó tiene autoridad para confirmar el cobro al instante.
    await tx.paymentSchedule.update({
      where: { id: schedule.id },
      data: {
        estado:      'PAID',
        montoPagado: schedule.montoEsperado,
        pagadoAt:    pagadoAtMx,
      },
    })

    await tx.cashRegister.upsert({
      where: { cobradorId_fecha: { cobradorId: cobradorRegistroId, fecha: fechaCaja } },
      create: {
        cobradorId:           cobradorRegistroId,
        branchId:             schedule.loan.branchId,
        fecha:                fechaCaja,
        cobradoEfectivo:      metodoPago === 'CASH'     ? monto : 0,
        cobradoTarjeta:       metodoPago === 'CARD'     ? monto : 0,
        cobradoTransferencia: metodoPago === 'TRANSFER' ? monto : 0,
      },
      update: {
        cobradoEfectivo:      metodoPago === 'CASH'     ? { increment: monto } : undefined,
        cobradoTarjeta:       metodoPago === 'CARD'     ? { increment: monto } : undefined,
        cobradoTransferencia: metodoPago === 'TRANSFER' ? { increment: monto } : undefined,
      },
    })

    // 3. Si todos los pagos del crédito quedan PAID → liquidar el crédito
    const pendientes = await tx.paymentSchedule.count({
      where: {
        loanId: params.id,
        id:     { not: schedule.id },
        estado: { not: 'PAID' },
      },
    })

    if (pendientes === 0 && schedule.loan.estado === 'ACTIVE') {
      await tx.loan.update({
        where: { id: schedule.loan.id },
        data:  { estado: 'LIQUIDATED' },
      })
    }
  })

  createAuditLog({
    userId,
    accion: 'DG_APPLY_PAYMENT',
    tabla:  'PaymentSchedule',
    registroId: schedule.id,
    valoresAnteriores: snapshotAntes,
    valoresNuevos: {
      estado:      'PAID',
      montoPagado: schedule.montoEsperado,
      pagadoAt:    pagadoAtMx,
      metodoPago,
      monto,
      ...(metodoPago === 'TRANSFER' ? { statusTransferencia: 'VERIFICADO' } : {}),
    },
  })

  return NextResponse.json({
    message: 'Pago aplicado correctamente',
  })
}
