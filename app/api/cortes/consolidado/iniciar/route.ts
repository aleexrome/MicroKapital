import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import {
  debeHacerCorte,
  parcialesParaConsolidar,
  siguienteNumeroCorte,
  concentradorDeSucursal,
} from '@/lib/cortes'
import { todayMx, esViernesMk } from '@/lib/timezone'

/**
 * POST /api/cortes/consolidado/iniciar
 *
 * La concentradora local (Branch.concentradorUserId) agrupa todos los
 * PARCIALES ACEPTADOS del día (de otros coords + los suyos propios) que
 * no estén ya asignados a un consolidado activo, y los une en un nuevo
 * Corte tipo CONSOLIDADO que luego entrega a DG/DC.
 *
 * Puede hacer varios consolidados al día (ej. uno a las 2pm con lo
 * recibido hasta esa hora, otro a las 6pm con el resto).
 *
 * Si una sucursal no tiene concentradora, el coord mismo es su propia
 * concentradora (sus parciales se auto-aceptaron) y usa este endpoint
 * para armar el consolidado del día.
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

  // Solo la concentradora local (o un coord sin concentradora) puede
  // iniciar un consolidado — un coord normal no tiene parciales recibidos.
  const concentradora = await concentradorDeSucursal(prisma, branchId)
  const esYoConcentrador = concentradora?.id === userId
  const sinConcentradora = !concentradora
  if (!esYoConcentrador && !sinConcentradora) {
    return NextResponse.json({
      error: 'Solo la concentradora local puede iniciar un consolidado.',
    }, { status: 403 })
  }

  const fecha = todayMx()

  // Semana MK: concentradora entrega consolidado a DG/DC solo los viernes
  // (día que Dirección hace corte con los concentradores).
  if (!esViernesMk(fecha)) {
    return NextResponse.json({
      error: 'Los consolidados se entregan los viernes (día de corte con Dirección). Hoy no es viernes.',
    }, { status: 400 })
  }

  const parciales = await parcialesParaConsolidar(prisma, userId, fecha)

  if (parciales.length === 0) {
    return NextResponse.json({
      error: 'No hay parciales aceptados pendientes para consolidar esta semana.',
    }, { status: 400 })
  }

  const totalAEntregar = parciales.reduce((s, p) => s + p.montoAceptado, 0)
  const numeroCorte = await siguienteNumeroCorte(prisma, userId, fecha, 'CONSOLIDADO')

  // Transacción: crear el consolidado + ligar los parciales a él.
  const consolidado = await prisma.$transaction(async (tx) => {
    const c = await tx.corte.create({
      data: {
        companyId: companyId!,
        userId,
        fecha,
        branchId,
        tipo: 'CONSOLIDADO',
        numeroCorte,
        // Los campos de "cobrado" quedan en 0 — el desglose vive en los
        // parciales hijos. totalRecibidoDeOtros / totalAEntregar reflejan
        // lo agrupado.
        totalRecibidoDeOtros: totalAEntregar,
        totalAEntregar,
        estado: 'ABIERTO',
      },
    })

    await tx.corte.updateMany({
      where: { id: { in: parciales.map((p) => p.id) } },
      data:  { consolidadoPadreId: c.id },
    })

    return c
  })

  createAuditLog({
    userId,
    accion: 'ABRIR_CONSOLIDADO',
    tabla: 'Corte',
    registroId: consolidado.id,
    valoresNuevos: {
      numeroCorte,
      tipo: 'CONSOLIDADO',
      totalAEntregar,
      parcialesIncluidos: parciales.map((p) => p.id),
    },
  })

  return NextResponse.json({
    corteId:         consolidado.id,
    numeroCorte,
    totalAEntregar,
    parcialesCount:  parciales.length,
  })
}
