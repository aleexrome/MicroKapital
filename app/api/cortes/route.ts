import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import {
  debeHacerCorte,
  esReceptorFinal,
  snapshotCashRegisterDelDia,
  totalRecibidoDeOtrosEnDia,
} from '@/lib/cortes'
import { todayMx } from '@/lib/timezone'

/**
 * POST /api/cortes
 *
 * Abre o devuelve el Corte del día del usuario autenticado. Idempotente:
 * si ya existe (manual o auto-creado por el cron 18:00), lo devuelve.
 * El UI lo llama al entrar a la pantalla del corte, y el layout wrapper
 * lo usa para detectar bloqueos.
 *
 * El Corte arranca en estado ABIERTO. Los totales se recalculan desde
 * CashRegister cada vez (hasta ENTREGADO; luego quedan snapshot).
 */
export async function POST(_req: NextRequest) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: userId, rol, companyId, branchId } = session.user
  if (!debeHacerCorte(rol)) {
    return NextResponse.json({ error: 'Tu rol no hace corte del día' }, { status: 403 })
  }
  if (!branchId) {
    return NextResponse.json({ error: 'No tienes sucursal asignada' }, { status: 400 })
  }

  const fecha = todayMx()
  const snap  = await snapshotCashRegisterDelDia(prisma, userId, fecha)
  const recibido = await totalRecibidoDeOtrosEnDia(prisma, userId, fecha)

  // Upsert — un corte por user por día.
  const corte = await prisma.corte.upsert({
    where: { userId_fecha: { userId, fecha } },
    create: {
      companyId: companyId!,
      userId,
      fecha,
      branchId,
      totalEfectivoCobrado:      snap.efectivo,
      totalTarjetaCobrado:       snap.tarjeta,
      totalTransferenciaCobrado: snap.transferencia,
      totalRecibidoDeOtros:      recibido,
      totalAEntregar:            snap.efectivo + recibido,  // solo efectivo entra al físico
    },
    update: {
      // Si está ABIERTO, re-sincronizar totales con los últimos cobros.
      // Si ya está ENTREGADO/ACEPTADO/RECHAZADO, no sobrescribir snapshot.
    },
  })

  // Si está ABIERTO, re-sincronizamos los totales a los más recientes.
  if (corte.estado === 'ABIERTO' || corte.estado === 'RECHAZADO') {
    await prisma.corte.update({
      where: { id: corte.id },
      data: {
        totalEfectivoCobrado:      snap.efectivo,
        totalTarjetaCobrado:       snap.tarjeta,
        totalTransferenciaCobrado: snap.transferencia,
        totalRecibidoDeOtros:      recibido,
        totalAEntregar:            snap.efectivo + recibido,
      },
    })
  }

  return NextResponse.json({ corteId: corte.id, estado: corte.estado })
}

/**
 * GET /api/cortes
 *
 * Lista los cortes del usuario autenticado:
 *   - ?dirigidos=1 → cortes donde yo soy receptor (para panel de aceptación)
 *   - sin filtro   → mis propios cortes
 *   - ?desde&hasta → filtros de fecha
 */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: userId, companyId } = session.user
  const sp = req.nextUrl.searchParams
  const dirigidos = sp.get('dirigidos') === '1'
  const desde = sp.get('desde')
  const hasta = sp.get('hasta')

  const where: Record<string, unknown> = {
    companyId: companyId!,
    ...(dirigidos ? { receptorId: userId } : { userId }),
  }
  if (desde || hasta) {
    where.fecha = {
      ...(desde ? { gte: new Date(desde) } : {}),
      ...(hasta ? { lte: new Date(hasta) } : {}),
    }
  }

  const cortes = await prisma.corte.findMany({
    where,
    orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
    take: 200,
    include: {
      user:     { select: { id: true, nombre: true, rol: true } },
      receptor: { select: { id: true, nombre: true, rol: true } },
      branch:   { select: { id: true, nombre: true } },
    },
  })

  return NextResponse.json({ cortes })
}
