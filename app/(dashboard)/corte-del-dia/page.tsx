import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { todayMx, esViernesMk } from '@/lib/timezone'
import {
  debeHacerCorte,
  esReceptorFinal,
  concentradorDeSucursal,
  receptoresValidosPara,
  snapshotParcialIncremental,
  parcialesParaConsolidar,
} from '@/lib/cortes'
import { CorteDelDiaView } from '@/components/cortes/CorteDelDiaView'

/**
 * /corte-del-dia — pantalla única por rol.
 *   • COBRADOR/COORD/GERENTE/GZ: panel para abrir+entregar parciales del día
 *   • MESA_CONTROL (concentradora): panel con parciales recibidos + consolidar
 *   • DG/DC/SA (receptor final): timeline + consolidados a confirmar
 *
 * Todos ven el timeline del día de su sucursal. DG/DC/SA ven el timeline
 * de TODAS las sucursales.
 */
export default async function CorteDelDiaPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  const { id: userId, rol, companyId, branchId, name: userNombre } = session.user

  const fecha = todayMx()
  const esReceptor = esReceptorFinal(rol)
  const hacesCorte = debeHacerCorte(rol)

  if (!esReceptor && !hacesCorte) {
    redirect('/dashboard')
  }

  const branchRow = branchId
    ? await prisma.branch.findUnique({ where: { id: branchId }, select: { nombre: true } })
    : null
  const branchNombre = branchRow?.nombre ?? '—'

  // ── Datos del user (COORD/CONC/GERENTE) ─────────────────────────────
  const [parcialesPropios, consolidadosPropios, concentradora, receptoresValidos, snapIncremental] = await Promise.all([
    hacesCorte && branchId
      ? prisma.corte.findMany({
          where: { userId, fecha, tipo: 'PARCIAL' },
          orderBy: { numeroCorte: 'asc' },
          include: {
            receptor: { select: { id: true, nombre: true, rol: true } },
          },
        })
      : Promise.resolve([]),
    hacesCorte && branchId
      ? prisma.corte.findMany({
          where: { userId, fecha, tipo: 'CONSOLIDADO' },
          orderBy: { numeroCorte: 'asc' },
          include: {
            receptor:         { select: { id: true, nombre: true, rol: true } },
            consolidadoHijos: { select: { id: true, numeroCorte: true, totalAEntregar: true, user: { select: { nombre: true } } } },
          },
        })
      : Promise.resolve([]),
    hacesCorte && branchId ? concentradorDeSucursal(prisma, branchId) : Promise.resolve(null),
    hacesCorte && branchId
      ? receptoresValidosPara(prisma, { id: userId, branchId, companyId })
      : Promise.resolve([]),
    hacesCorte && branchId ? snapshotParcialIncremental(prisma, userId, fecha) : Promise.resolve({ efectivo: 0, tarjeta: 0, transferencia: 0, recibidoDeOtros: 0 }),
  ])

  const esConcentradora = concentradora?.id === userId
  const sinConcentradora = !concentradora

  // ── Detalle de cada parcial propio: qué Payments (cliente+monto+método)
  //    cayeron dentro de la ventana de ese parcial, y qué parciales de
  //    OTROS coords acepté entre un parcial y el siguiente (que es el
  //    origen de "Recibido $X"). Permite expandir cada card para auditar.
  //
  // La ventana del PRIMER parcial del día empieza en el inicio del día
  // (no `null`) — si no, agarraba TODOS los pagos históricos del
  // cobrador y mostraba 3,969 cobros en el desglose.
  const inicioDelDiaMx = fecha  // todayMx() ya devuelve 00:00 CDMX
  const parcialesDetalle = await Promise.all(parcialesPropios.map(async (p, idx) => {
    const limiteInferior = idx > 0 ? parcialesPropios[idx - 1].createdAt : inicioDelDiaMx
    const ventana = {
      gt:  limiteInferior,
      lte: p.createdAt,
    }
    const [pagosClientes, parcialesIngesta] = await Promise.all([
      prisma.payment.findMany({
        where: {
          cobradorId: userId,
          canceledAt: null,
          fechaHora:  ventana,
        },
        include: {
          client:   { select: { nombreCompleto: true } },
          schedule: { select: { numeroPago: true } },
        },
        orderBy: { fechaHora: 'asc' },
      }),
      prisma.corte.findMany({
        where: {
          receptorId: userId,
          tipo:       'PARCIAL',
          estado:     'ACEPTADO',
          userId:     { not: userId },
          aceptadoAt: ventana,
        },
        include: { user: { select: { nombre: true } } },
        orderBy: { aceptadoAt: 'asc' },
      }),
    ])
    return {
      corteId: p.id,
      pagosClientes: pagosClientes.map((pay) => ({
        id:         pay.id,
        clienteNombre: pay.client.nombreCompleto,
        monto:         Number(pay.monto),
        metodoPago:    pay.metodoPago,
        numeroPago:    pay.schedule?.numeroPago ?? null,
        fechaHora:     pay.fechaHora.toISOString(),
      })),
      parcialesIngesta: parcialesIngesta.map((pr) => ({
        id:            pr.id,
        numeroCorte:   pr.numeroCorte,
        total:         Number(pr.totalAEntregar),
        userNombre:    pr.user.nombre,
        aceptadoAt:    pr.aceptadoAt?.toISOString() ?? null,
      })),
    }
  }))

  // ── Si soy concentradora/coord-sin-concentradora: parciales a consolidar ─
  const parcialesParaMiConsolidado = (esConcentradora || sinConcentradora) && hacesCorte
    ? await parcialesParaConsolidar(prisma, userId, fecha)
    : []

  // ── Parciales ENTREGADOS que me dirigieron (acepto como concentradora) ─
  const parcialesEntregadosRecibidos = hacesCorte
    ? await prisma.corte.findMany({
        where: {
          receptorId: userId,
          fecha,
          tipo:       'PARCIAL',
          estado:     'ENTREGADO',
        },
        orderBy: { entregadoAt: 'asc' },
        include: {
          user: { select: { id: true, nombre: true, rol: true } },
        },
      })
    : []

  // ── Consolidados ENTREGADOS dirigidos a mí (confirmo como DG/DC/SA) ─
  const consolidadosPendientesConfirmar = esReceptor
    ? await prisma.corte.findMany({
        where: {
          receptorId: userId,
          companyId:  companyId!,
          tipo:       'CONSOLIDADO',
          estado:     'ENTREGADO',
        },
        orderBy: { entregadoAt: 'asc' },
        include: {
          user:   { select: { id: true, nombre: true, rol: true } },
          branch: { select: { id: true, nombre: true } },
          consolidadoHijos: {
            select: {
              id: true, numeroCorte: true, totalAEntregar: true,
              user: { select: { nombre: true } },
            },
          },
        },
      })
    : []

  // ── Histórico: cortes de los últimos 14 días (sin incluir hoy) ───
  const haceDosSemanas = new Date(fecha.getTime() - 14 * 24 * 60 * 60 * 1000)
  const cortesHistoricos = await prisma.corte.findMany({
    where: {
      companyId: companyId!,
      fecha: { gte: haceDosSemanas, lt: fecha },
      OR: [{ userId }, { receptorId: userId }],
    },
    orderBy: [{ fecha: 'desc' }, { numeroCorte: 'asc' }],
    take: 300,
    include: {
      user:     { select: { id: true, nombre: true } },
      receptor: { select: { id: true, nombre: true } },
    },
  })

  // ── Timeline por sucursal (para DG/DC/SA ve todas; coord/conc ve la suya) ─
  const sucursalIdsParaTimeline = esReceptor
    ? (await prisma.branch.findMany({ where: { companyId: companyId! }, select: { id: true } })).map((b) => b.id)
    : branchId ? [branchId] : []

  const cortesTimeline = sucursalIdsParaTimeline.length > 0
    ? await prisma.corte.findMany({
        where: {
          branchId: { in: sucursalIdsParaTimeline },
          fecha,
        },
        orderBy: [{ branchId: 'asc' }, { tipo: 'asc' }, { numeroCorte: 'asc' }],
        include: {
          user:     { select: { id: true, nombre: true, rol: true } },
          receptor: { select: { id: true, nombre: true, rol: true } },
          branch:   { select: { id: true, nombre: true } },
        },
      })
    : []

  return (
    <CorteDelDiaView
      userId={userId}
      userNombre={userNombre}
      userRol={rol}
      branchNombre={branchNombre}
      esConcentradora={esConcentradora}
      sinConcentradora={sinConcentradora}
      concentradora={concentradora}
      parcialesPropios={JSON.parse(JSON.stringify(parcialesPropios))}
      parcialesDetalle={parcialesDetalle}
      consolidadosPropios={JSON.parse(JSON.stringify(consolidadosPropios))}
      parcialesEntregadosRecibidos={JSON.parse(JSON.stringify(parcialesEntregadosRecibidos))}
      parcialesParaConsolidar={parcialesParaMiConsolidado}
      consolidadosPendientesConfirmar={JSON.parse(JSON.stringify(consolidadosPendientesConfirmar))}
      receptoresValidos={receptoresValidos}
      snapIncremental={snapIncremental}
      cortesTimeline={JSON.parse(JSON.stringify(cortesTimeline))}
      cortesHistoricos={JSON.parse(JSON.stringify(cortesHistoricos))}
      esViernes={esViernesMk(fecha)}
    />
  )
}
