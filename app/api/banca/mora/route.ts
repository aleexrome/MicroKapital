import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { todayMx } from '@/lib/timezone'
import { createAuditLog } from '@/lib/audit'

const cashBreakdownSchema = z.object({
  denominacion: z.number().int().positive(),
  cantidad:     z.number().int().positive(),
  subtotal:     z.number().positive(),
})

const createSchema = z.object({
  clientId:        z.string().uuid(),
  loanId:          z.string().uuid(),
  scheduleId:      z.string().uuid(),
  tipo:            z.enum(['MULTA', 'MORA']),
  monto:           z.number().positive(),
  metodoPago:      z.enum(['CASH', 'TRANSFER']),
  cashBreakdown:   z.array(cashBreakdownSchema).optional().default([]),
  cuentaDestinoId: z.string().uuid().optional(),
  idTransferencia: z.string().max(100).optional(),
  referenciaBanco: z.string().max(100).optional(),
  notas:           z.string().max(300).optional(),
})

/**
 * POST /api/banca/mora
 *
 * DG/DC/SA registra una MULTA o MORA desde la vista /banca y la marca
 * cobrada EN EL ACTO. Se liga a un préstamo + cuota específicos del
 * cliente. Crea:
 *   1. Payment (metodoPago elegido, monto, notas con el tipo).
 *   2. CashBreakdown si es CASH + desglose.
 *   3. MoraCobro {cobrada: true, cobradaAt: now, paymentCobroId}.
 *   4. CashRegister del DG actualizado (día CDMX).
 *
 * Constraint @@unique([scheduleId, tipo]) en MoraCobro: si ya existe
 * una mora del mismo tipo para esa cuota, responde 409.
 */
export async function POST(req: NextRequest) {
  try {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, id: userId, branchId: sessionBranchId } = session.user
  if (rol !== 'DIRECTOR_GENERAL' && rol !== 'DIRECTOR_COMERCIAL' && rol !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }
  if (!companyId) return NextResponse.json({ error: 'Sin empresa' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    const msg = `Datos inválidos: ${first?.message ?? 'verifica los campos'}`
    return NextResponse.json({ error: msg, fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const data = parsed.data

  // Validar que el schedule pertenezca al loan y al cliente de la empresa.
  const schedule = await prisma.paymentSchedule.findFirst({
    where: {
      id: data.scheduleId,
      loanId: data.loanId,
      loan: { companyId, clientId: data.clientId },
    },
    include: {
      loan: { select: { id: true, branchId: true, cobradorId: true } },
    },
  })
  if (!schedule) {
    return NextResponse.json({ error: 'Cuota no encontrada para ese préstamo/cliente' }, { status: 404 })
  }

  // Validar duplicado por constraint @@unique([scheduleId, tipo]).
  const yaExiste = await prisma.moraCobro.findFirst({
    where: { scheduleId: data.scheduleId, tipo: data.tipo },
    select: { id: true, cobrada: true },
  })
  if (yaExiste) {
    return NextResponse.json({
      error: `Ya existe una ${data.tipo} registrada para esta cuota${yaExiste.cobrada ? ' (ya cobrada)' : ''}.`,
    }, { status: 409 })
  }

  // Si es TRANSFER validamos cuenta destino.
  if (data.metodoPago === 'TRANSFER' && !data.cuentaDestinoId) {
    return NextResponse.json({ error: 'Falta cuenta destino para transferencia' }, { status: 400 })
  }

  const now = new Date()
  const fechaCaja = todayMx()
  const targetBranchId = schedule.loan.branchId
  const notasPayment = (data.notas?.trim())
    ? `${data.tipo} manual (DG): ${data.notas.trim()}`
    : `${data.tipo} manual por Dirección — cuota #${schedule.numeroPago}`

  const result = await prisma.$transaction(async (tx) => {
    // 1. Payment.
    const payment = await tx.payment.create({
      data: {
        loanId:         data.loanId,
        scheduleId:     null,  // mora/multa se registra como Payment suelto,
                                // mismo patrón que /api/loans/.../mora/cobrar
        cobradorId:     userId,
        clientId:       data.clientId,
        monto:          data.monto,
        metodoPago:     data.metodoPago,
        cambioEntregado: 0,
        notas:          notasPayment,
        fechaHora:      now,
        ...(data.metodoPago === 'TRANSFER' ? {
          cuentaDestinoId:     data.cuentaDestinoId ?? null,
          idTransferencia:     data.idTransferencia?.trim() || null,
          referenciaBanco:     data.referenciaBanco?.trim() || null,
          // Como lo registra DG directamente, lo marcamos VERIFICADO al
          // mismo tiempo — no hay ciclo de "pendiente de verificar" para
          // moras capturadas por Dirección.
          statusTransferencia: 'VERIFICADO',
          verificadoPorId:     userId,
          verificadoAt:        now,
        } : {}),
      },
    })

    // 2. Desglose en efectivo.
    if (data.metodoPago === 'CASH' && data.cashBreakdown.length > 0) {
      await tx.cashBreakdown.createMany({
        data: data.cashBreakdown.map((d) => ({
          paymentId:    payment.id,
          denominacion: d.denominacion,
          cantidad:     d.cantidad,
          subtotal:     d.subtotal,
        })),
      })
    }

    // 3. MoraCobro cobrada en el acto.
    const moraCobro = await tx.moraCobro.create({
      data: {
        companyId,
        branchId:       targetBranchId,
        loanId:         data.loanId,
        scheduleId:     data.scheduleId,
        clientId:       data.clientId,
        cobradorId:     userId,
        tipo:           data.tipo,
        monto:          data.monto,
        paymentOrigenId: null,
        paymentCobroId: payment.id,
        cobrada:        true,
        cobradaAt:      now,
      },
    })

    // 4. CashRegister — mismo sucursal que el préstamo. Si el DG tiene
    //    sucursal propia en sesión, prevalece la del loan (que es el
    //    destino del dinero).
    await tx.cashRegister.upsert({
      where: { cobradorId_fecha: { cobradorId: userId, fecha: fechaCaja } },
      create: {
        cobradorId:           userId,
        branchId:             targetBranchId,
        fecha:                fechaCaja,
        cobradoEfectivo:      data.metodoPago === 'CASH' ? data.monto : 0,
        cobradoTarjeta:       0,
        cobradoTransferencia: data.metodoPago === 'TRANSFER' ? data.monto : 0,
        cambioEntregado:      0,
      },
      update: {
        cobradoEfectivo:      data.metodoPago === 'CASH'     ? { increment: data.monto } : undefined,
        cobradoTransferencia: data.metodoPago === 'TRANSFER' ? { increment: data.monto } : undefined,
      },
    })

    return { payment, moraCobro }
  }, { timeout: 15000, maxWait: 8000 })

  createAuditLog({
    userId,
    accion:     'BANCA_REGISTRAR_MORA',
    tabla:      'MoraCobro',
    registroId: result.moraCobro.id,
    valoresNuevos: {
      tipo:       data.tipo,
      monto:      data.monto,
      scheduleId: data.scheduleId,
      loanId:     data.loanId,
      clientId:   data.clientId,
      metodoPago: data.metodoPago,
      paymentId:  result.payment.id,
    },
  })

  return NextResponse.json({
    ok: true,
    moraCobroId: result.moraCobro.id,
    paymentId:   result.payment.id,
  }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[banca/mora] fallo:', msg, e)
    return NextResponse.json({ error: `No se pudo registrar la mora: ${msg}` }, { status: 500 })
  }
}

/**
 * GET /api/banca/mora?clientId=xxx
 *
 * Carga los préstamos activos del cliente + sus cuotas (número, fecha,
 * estado, montoEsperado, montoPagado). Lo usa el combobox del modal
 * para dejar al DG elegir préstamo + cuota tras seleccionar cliente.
 */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId } = session.user
  if (rol !== 'DIRECTOR_GENERAL' && rol !== 'DIRECTOR_COMERCIAL' && rol !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }
  if (!companyId) return NextResponse.json({ error: 'Sin empresa' }, { status: 400 })

  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'Falta clientId' }, { status: 400 })

  const loans = await prisma.loan.findMany({
    where: {
      clientId,
      companyId,
      estado: { in: ['ACTIVE', 'DEFAULTED'] },
    },
    select: {
      id:        true,
      tipo:      true,
      capital:   true,
      estado:    true,
      fechaDesembolso: true,
      branch:    { select: { id: true, nombre: true } },
      schedule: {
        select: {
          id:               true,
          numeroPago:       true,
          fechaVencimiento: true,
          estado:           true,
          montoEsperado:    true,
          montoPagado:      true,
          moraCobros: {
            select: { tipo: true, cobrada: true },
          },
        },
        orderBy: { numeroPago: 'asc' },
      },
    },
    orderBy: { fechaDesembolso: 'desc' },
  })

  return NextResponse.json({
    loans: loans.map((l) => ({
      id:              l.id,
      tipo:            l.tipo,
      capital:         Number(l.capital),
      estado:          l.estado,
      fechaDesembolso: l.fechaDesembolso?.toISOString() ?? null,
      branch:          l.branch,
      schedule: l.schedule.map((s) => ({
        id:               s.id,
        numeroPago:       s.numeroPago,
        fechaVencimiento: s.fechaVencimiento.toISOString(),
        estado:           s.estado,
        montoEsperado:    Number(s.montoEsperado),
        montoPagado:      Number(s.montoPagado),
        tieneMulta:       s.moraCobros.some((m) => m.tipo === 'MULTA'),
        tieneMora:        s.moraCobros.some((m) => m.tipo === 'MORA'),
      })),
    })),
  })
}
