import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import {
  debeHacerCorte,
  parcialesParaConsolidar,
  siguienteNumeroCorte,
  concentradorDeSucursal,
  efectivoPropioResiduoSemana,
} from '@/lib/cortes'
import { todayMx, esViernesMk, inicioSemanaMk } from '@/lib/timezone'

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

  // Guard: no permitir consolidar si hay parciales de coords de la
  // semana MK que todavía no están ACEPTADOS (ABIERTO, ENTREGADO sin
  // aceptar, o RECHAZADO sin corregir). Entregar un consolidado
  // incompleto al DG se convierte en un problema muy costoso de
  // rastrear a posteriori — mejor obligar a cerrar primero cada
  // parcial.
  const semanaDesde = inicioSemanaMk(fecha)
  const parcialesPendientes = await prisma.corte.findMany({
    where: {
      receptorId: userId,
      tipo:       'PARCIAL',
      fecha:      { gte: semanaDesde, lte: fecha },
      estado:     { in: ['ABIERTO', 'ENTREGADO', 'RECHAZADO'] },
      consolidadoPadreId: null,
    },
    select: {
      id: true,
      estado: true,
      user: { select: { nombre: true } },
    },
    orderBy: [{ user: { nombre: 'asc' } }, { createdAt: 'asc' }],
  })
  if (parcialesPendientes.length > 0) {
    const detalle = parcialesPendientes
      .map((p) => `${p.user.nombre} (${p.estado.toLowerCase()})`)
      .join(', ')
    return NextResponse.json({
      error: `Faltan parciales por aceptar/corregir esta semana: ${detalle}. Acéptalos (o pídele a quien lo rechazó que lo corrija) antes de consolidar.`,
      parcialesPendientesIds: parcialesPendientes.map((p) => p.id),
    }, { status: 409 })
  }

  // Antes de agrupar: si el user es concentradora (o coord sin
  // concentradora) tiene efectivo propio de la semana que no entró a
  // un parcial, le creamos un parcial auto-aceptado con ese residuo.
  // Así la concentradora no tiene que apretar "Iniciar parcial" durante
  // la semana — todo se consolida con un solo botón el viernes.
  const residuo = await efectivoPropioResiduoSemana(prisma, userId, fecha)
  if (residuo.efectivo > 0 || residuo.tarjeta > 0 || residuo.transferencia > 0) {
    const totalResiduo = residuo.efectivo  // solo efectivo va al físico
    const numeroParcialAuto = await siguienteNumeroCorte(prisma, userId, fecha, 'PARCIAL')
    await prisma.corte.create({
      data: {
        companyId: companyId!,
        userId,
        fecha,
        branchId,
        tipo: 'PARCIAL',
        numeroCorte: numeroParcialAuto,
        totalEfectivoCobrado:      residuo.efectivo,
        totalTarjetaCobrado:       residuo.tarjeta,
        totalTransferenciaCobrado: residuo.transferencia,
        totalRecibidoDeOtros:      0,
        totalAEntregar:            totalResiduo,
        estado:         'ACEPTADO',
        receptorId:     userId,
        entregadoAt:    new Date(),
        aceptadoAt:     new Date(),
        montoAceptado:  totalResiduo,
        autoCreadoAt:   new Date(),
      },
    })
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
