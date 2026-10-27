import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import {
  debeHacerCorte,
  snapshotParcialIncremental,
  siguienteNumeroCorte,
  concentradorDeSucursal,
} from '@/lib/cortes'
import { todayMx } from '@/lib/timezone'

/**
 * POST /api/cortes/parcial/iniciar
 *
 * Abre un nuevo corte PARCIAL para el día actual. El coord puede cerrar
 * varios parciales al día conforme va juntando efectivo. Cada parcial
 * captura SOLO lo cobrado desde el parcial anterior (incremental), no
 * el acumulado total — así al sumar los parciales en el consolidado
 * no se duplica.
 *
 * Si no hay dinero nuevo que entregar (efectivo = 0 y nada recibido
 * desde el último parcial), devuelve 400 para evitar parciales vacíos.
 *
 * El Corte arranca en ABIERTO. El coord sube la foto del ticket
 * firmado y lo marca entregado desde /api/cortes/[id]/entregar.
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
  const snap  = await snapshotParcialIncremental(prisma, userId, fecha)

  // No permitir parciales con 0 efectivo + 0 recibido — no hay nada
  // que entregar. (Tarjeta/transferencia no entran al físico, así que
  // no cuentan para "¿hay algo que entregar?".)
  if (snap.efectivo === 0 && snap.recibidoDeOtros === 0) {
    return NextResponse.json({
      error: 'No hay efectivo nuevo desde el último parcial. Cobra algo antes de abrir otro parcial.',
    }, { status: 400 })
  }

  const numeroCorte = await siguienteNumeroCorte(prisma, userId, fecha, 'PARCIAL')

  // Si el user ES el concentrador local de su sucursal, no tiene a
  // quién entregarle en este nivel — el parcial se auto-acepta y
  // queda disponible para incluirlo en su propio consolidado luego.
  const concentradora = await concentradorDeSucursal(prisma, branchId)
  const esYoConcentrador = concentradora?.id === userId
  const totalAEntregar = snap.efectivo + snap.recibidoDeOtros

  const corte = await prisma.corte.create({
    data: {
      companyId: companyId!,
      userId,
      fecha,
      branchId,
      tipo: 'PARCIAL',
      numeroCorte,
      totalEfectivoCobrado:      snap.efectivo,
      totalTarjetaCobrado:       snap.tarjeta,
      totalTransferenciaCobrado: snap.transferencia,
      totalRecibidoDeOtros:      snap.recibidoDeOtros,
      totalAEntregar,
      // Si yo soy mi propia concentradora, auto-acepto para que el
      // monto quede disponible al momento de armar mi consolidado.
      ...(esYoConcentrador
        ? {
            estado:         'ACEPTADO',
            receptorId:     userId,
            entregadoAt:    new Date(),
            aceptadoAt:     new Date(),
            montoAceptado:  totalAEntregar,
          }
        : {}),
    },
  })

  createAuditLog({
    userId,
    accion: esYoConcentrador ? 'ABRIR_PARCIAL_AUTO_ACEPTADO' : 'ABRIR_PARCIAL',
    tabla: 'Corte',
    registroId: corte.id,
    valoresNuevos: {
      numeroCorte,
      tipo: 'PARCIAL',
      totalEfectivo:   snap.efectivo,
      totalRecibido:   snap.recibidoDeOtros,
      totalAEntregar,
      autoAceptado:    esYoConcentrador,
    },
  })

  return NextResponse.json({
    corteId: corte.id,
    estado:  corte.estado,
    numeroCorte,
    totalAEntregar,
    autoAceptado: esYoConcentrador,
  })
}
