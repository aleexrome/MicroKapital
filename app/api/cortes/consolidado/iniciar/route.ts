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
  netoBancaConcentradoraSemana,
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
  try {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: userId, rol, companyId } = session.user
  let { branchId } = session.user
  if (!debeHacerCorte(rol)) {
    return NextResponse.json({ error: 'Tu rol no hace corte del día' }, { status: 403 })
  }

  // MESA_CONTROL (ej. Carol) no tiene branchId propio porque es rol
  // empresa, pero sí figura como concentradora de alguna sucursal
  // (Branch.concentradorUserId). Si no tiene branchId, buscamos la
  // sucursal que concentra y usamos su branchId para crear el
  // consolidado (y el parcial residuo). Antes el endpoint rebotaba
  // con "No tienes sucursal asignada" aunque sí fuera concentradora.
  if (!branchId) {
    const branchConcentrada = await prisma.branch.findFirst({
      where:  { companyId: companyId!, concentradorUserId: userId, activa: true },
      select: { id: true },
      orderBy: { nombre: 'asc' },
    })
    if (!branchConcentrada) {
      return NextResponse.json({ error: 'No tienes sucursal asignada' }, { status: 400 })
    }
    branchId = branchConcentrada.id
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

  // (Antes había un guard que bloqueaba si existían parciales de la
  // semana en ABIERTO / ENTREGADO sin aceptar / RECHAZADO. Se eliminó
  // en la 2026-11 por decisión de Dirección: ahora el monto del
  // consolidado sale del Neto Banca — no de la suma de parciales — así
  // que parciales no-aceptados son evidencia incompleta pero no
  // alteran el monto. Se pueden procesar/auditar después sin bloquear
  // la entrega del viernes.)

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

  // Fuente de verdad del monto: Neto de Banca de la semana MK para
  // las sucursales que concentra el user. Antes se sumaba el
  // montoAceptado de los parciales recibidos — eso NO cuadraba con
  // Banca porque incluía transferencias (que ya están en banco) y no
  // restaba desembolsos ni sumaba adicionales. Decisión Dirección
  // 2026-11: "deben entregar lo que dice Banca". Los parciales siguen
  // agrupándose como evidencia pero el total a entregar sale del Neto.
  const neto = await netoBancaConcentradoraSemana(prisma, userId, fecha)
  const totalAEntregar = Math.max(0, neto.neto)

  if (totalAEntregar === 0 && parciales.length === 0) {
    return NextResponse.json({
      error: 'No hay nada que consolidar esta semana (Neto Banca = $0 y sin parciales recibidos).',
    }, { status: 400 })
  }

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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[cortes/consolidado/iniciar] fallo:', msg, e)
    return NextResponse.json({
      error: `No se pudo iniciar el consolidado: ${msg}`,
    }, { status: 500 })
  }
}
