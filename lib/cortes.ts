/**
 * Helpers del Corte del Día.
 *
 * Cadena de custodia:
 *   Coord local → Concentrador local (Branch.concentradorUserId) → DG o DC
 *   Si Branch.concentradorUserId es null → Coord entrega directo a DG/DC.
 *
 * Reglas:
 *   - TODOS los roles que cobran deben cerrar su corte diario.
 *   - DG/DC (y SUPER_ADMIN) son el último eslabón: aceptan y nunca entregan.
 *   - Sin corte cerrado del día anterior, pantalla congelada al siguiente login.
 */

import type { PrismaClient, UserRole } from '@prisma/client'
import { todayMx, inicioSemanaMk } from '@/lib/timezone'

/** Roles que deben hacer corte del día (cobran en campo o concentran). */
export const ROLES_HACEN_CORTE: readonly UserRole[] = [
  'COBRADOR',
  'COORDINADOR',
  'GERENTE',
  'GERENTE_ZONAL',
  'MESA_CONTROL',  // Carol MC es concentradora de Tenancingo II
] as const

/**
 * Receptores finales (último eslabón de la cadena). Reciben de los
 * concentradores locales y nunca se bloquean.
 */
export const ROLES_RECEPTORES_FINALES: readonly UserRole[] = [
  'DIRECTOR_GENERAL',
  'DIRECTOR_COMERCIAL',
  'SUPER_ADMIN',
] as const

export function debeHacerCorte(rol: string): boolean {
  return (ROLES_HACEN_CORTE as readonly string[]).includes(rol)
}

export function esReceptorFinal(rol: string): boolean {
  return (ROLES_RECEPTORES_FINALES as readonly string[]).includes(rol)
}

/**
 * Devuelve el user_id del concentrador local de la sucursal (quien
 * recibe los cortes de los coords de esa sucursal). Si Branch.concentradorUserId
 * es null, significa que los coords de esa sucursal entregan directo a
 * DG/DC — en ese caso, el UI deja al coord elegir entre DG/DC.
 */
export async function concentradorDeSucursal(
  prisma: PrismaClient,
  branchId: string,
): Promise<{ id: string; nombre: string } | null> {
  const b = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { concentrador: { select: { id: true, nombre: true, activo: true } } },
  })
  if (!b?.concentrador?.activo) return null
  return { id: b.concentrador.id, nombre: b.concentrador.nombre }
}

/**
 * Emails que NO deben aparecer como receptores aunque técnicamente tengan
 * rol que lo permita. Caso: Alejandro Romero tiene rol DIRECTOR_GENERAL
 * en BD (por permisos de sistema) pero realmente es Director de Sistemas
 * y NO maneja dinero físico — no debe salir en el dropdown de receptores.
 */
const EMAILS_EXCLUIR_RECEPTOR: readonly string[] = [
  'alejandro.romero@microkapital.com',
]

/**
 * Receptores válidos para un corte de este user:
 *   - Si el user ES el concentrador local de su sucursal → solo DG/DC/SA.
 *   - Si el user NO es concentrador local → solo el concentrador local (si existe);
 *     si no hay (Branch.concentradorUserId null), entonces DG/DC/SA.
 *
 * Nota: no incluye al propio user como receptor (no te entregas a ti mismo).
 */
export async function receptoresValidosPara(
  prisma: PrismaClient,
  user: { id: string; branchId: string | null; companyId: string | null },
): Promise<{ id: string; nombre: string; rol: UserRole }[]> {
  if (!user.branchId || !user.companyId) return []
  const concentrador = await concentradorDeSucursal(prisma, user.branchId)

  // Si yo soy el concentrador local (o no hay concentrador), paso al nivel final.
  const esYoConcentrador = concentrador?.id === user.id
  if (esYoConcentrador || !concentrador) {
    const finales = await prisma.user.findMany({
      where: {
        companyId: user.companyId,
        activo:    true,
        rol:       { in: [...ROLES_RECEPTORES_FINALES] },
        id:        { not: user.id },
        email:     { notIn: [...EMAILS_EXCLUIR_RECEPTOR] },
      },
      select:  { id: true, nombre: true, rol: true },
      orderBy: { nombre: 'asc' },
    })
    return finales
  }

  // User es coord normal → solo entrega al concentrador de su sucursal.
  const [row] = await prisma.user.findMany({
    where:  { id: concentrador.id, activo: true },
    select: { id: true, nombre: true, rol: true },
  })
  return row ? [row] : []
}

/**
 * Encuentra cortes PENDIENTES del usuario que lo deberían tener bloqueado.
 * "Pendiente" = del día de hoy pasadas las 18:00 MX sin ACEPTADO, o de
 * cualquier día anterior sin ACEPTADO.
 *
 * Un corte ENTREGADO (esperando aceptación del receptor) también bloquea
 * — el user no puede trabajar hasta que su entrega sea aceptada o
 * rechazada (y si rechazan, debe re-entregar).
 */
export async function cortePendienteDe(
  prisma: PrismaClient,
  user: { id: string; rol: string },
): Promise<{ id: string; tipo: 'PROPIO' | 'COLGANDO_CONSOLIDAR' } | null> {
  // DG/DC/SA no se bloquean nunca.
  if (esReceptorFinal(user.rol)) return null
  if (!debeHacerCorte(user.rol)) return null

  const hoy = todayMx()
  const ahora = new Date()
  // "Hora de corte obligatorio" — 18:00 hora MX.
  // Si todavía no son las 18:00 MX, los cortes del día actual no bloquean.
  //
  // OJO con el cálculo: todayMx() devuelve 06:00 UTC (= 00:00 CDMX).
  // Si usáramos `new Date(hoy).setHours(18,…)` el método opera en la
  // zona del servidor (UTC en Vercel) y resultaría en 18:00 UTC = 12:00
  // CDMX — bloqueaba al usuario a mediodía. Lo correcto: sumar 18h a
  // las 00:00 CDMX → 18:00 CDMX = 00:00 UTC del día siguiente.
  const corteObligatorioAt = new Date(hoy.getTime() + 18 * 60 * 60 * 1000)
  const hoyBloquea = ahora.getTime() >= corteObligatorioAt.getTime()

  // Buscar el corte PROPIO más viejo que todavía requiera acción del user.
  // Estados que bloquean:
  //   - ABIERTO: no ha subido foto/entregado — tiene que hacerlo.
  //   - RECHAZADO: el receptor lo rechazó — tiene que corregir y re-entregar.
  // Estados que NO bloquean:
  //   - ENTREGADO: ya hizo su parte (foto + envío). La aceptación es
  //     responsabilidad del receptor y puede tardar; el user puede seguir
  //     cobrando/trabajando sin esperar la confirmación.
  //   - ACEPTADO: cerrado, obviamente ok.
  // Excepción: cortes vacíos (totalAEntregar = 0) en estado ABIERTO
  // tampoco bloquean — no hay dinero físico que entregar.
  const row = await prisma.corte.findFirst({
    where: {
      userId: user.id,
      estado: { in: ['ABIERTO', 'RECHAZADO'] },
      OR: hoyBloquea
        ? [{ fecha: { lte: hoy } }]
        : [{ fecha: { lt: hoy } }],
      NOT: {
        AND: [
          { estado: 'ABIERTO' },
          { totalAEntregar: 0 },
        ],
      },
    },
    orderBy: { fecha: 'asc' },
    select:  { id: true },
  })
  if (row) return { id: row.id, tipo: 'PROPIO' }

  // La concentradora NO se bloquea nunca durante la semana por tener
  // parciales sin consolidar. El consolidado lo activa ella cuando
  // quiera durante el viernes; si no lo hace, un cron auto-consolida a
  // las 00:01 CDMX del sábado. El bloqueo COLGANDO_CONSOLIDAR del viernes
  // generaba fricción innecesaria (la congelaba desde las 00:00 del
  // viernes aunque todavía estaba cobrando y acumulando parciales).

  return null
}

/**
 * Snapshot de totales del CashRegister del user para la fecha dada.
 * Se usa al abrir/entregar el corte.
 */
export async function snapshotCashRegisterDelDia(
  prisma: PrismaClient,
  userId: string,
  fecha: Date,
): Promise<{ efectivo: number; tarjeta: number; transferencia: number }> {
  const reg = await prisma.cashRegister.findFirst({
    where: { cobradorId: userId, fecha },
    select: {
      cobradoEfectivo: true,
      cobradoTarjeta: true,
      cobradoTransferencia: true,
    },
  })
  return {
    efectivo:      Number(reg?.cobradoEfectivo ?? 0),
    tarjeta:       Number(reg?.cobradoTarjeta ?? 0),
    transferencia: Number(reg?.cobradoTransferencia ?? 0),
  }
}

/**
 * Lista los cortes de días anteriores a hoy que NO están ACEPTADOS
 * — abiertos, entregados sin aceptar o rechazados sin re-entregar. Es
 * el radar de "quién no cerró ayer" para Dirección.
 *
 * Agrupa por sucursal → coordinadores → cortes. Un mismo user puede
 * aparecer con más de un corte en estados distintos.
 */
export interface CortePendienteItem {
  corteId:               string
  tipo:                  'PARCIAL' | 'CONSOLIDADO'
  numeroCorte:           number
  fecha:                 Date
  diasAtraso:            number
  estado:                'ABIERTO' | 'ENTREGADO' | 'RECHAZADO'
  totalAEntregar:        number
  totalTransferValidada: number    // Payments TRANSFER verificados (ya en banca)
  rechazoRazon:          string | null
  receptorNombre:        string | null
}

export interface CobradorPendienteCorte {
  userId:                 string
  nombre:                 string
  rol:                    string
  cortes:                 CortePendienteItem[]
  diasMaxAtraso:          number
  // Desglose extra que NO vive en el modelo Corte (se calcula desde
  // Payments al momento de la vista). Sumado por el día más reciente
  // con corte pendiente del cobrador — vale como alerta operativa, no
  // como contabilidad precisa por parcial.
  transferPendiente:      number
  transferPendienteCount: number
  comisionApertura:       number
  seguroApertura:         number
}

export interface SucursalPendientesCortes {
  branchId:       string
  branchNombre:   string
  cobradores:     CobradorPendienteCorte[]
}

export async function cortesPendientesPorSucursal(
  prisma: PrismaClient,
  companyId: string,
): Promise<SucursalPendientesCortes[]> {
  const hoy = todayMx()
  const branches = await prisma.branch.findMany({
    where:  { companyId, activa: true },
    select: { id: true, nombre: true },
    orderBy:{ nombre: 'asc' },
  })

  const cortes = await prisma.corte.findMany({
    where: {
      companyId,
      fecha: { lt: hoy },
      estado: { in: ['ABIERTO', 'ENTREGADO', 'RECHAZADO'] },
      // Mismos criterios que cortePendienteDe: no mostrar como pendientes
      // los cortes vacíos ABIERTOS (sin cobros = sin dinero que entregar).
      NOT: {
        AND: [
          { estado: 'ABIERTO' },
          { totalAEntregar: 0 },
        ],
      },
      // Ocultar cortes de usuarios desactivados (ex-empleados). Si queda
      // un corte huérfano suyo, es un problema contable que requiere
      // intervención manual, no un pendiente operativo.
      user: { activo: true },
    },
    orderBy: [{ fecha: 'asc' }, { numeroCorte: 'asc' }],
    include: {
      user:     { select: { id: true, nombre: true, rol: true, branchId: true } },
      receptor: { select: { nombre: true } },
    },
  })

  const byBranch = new Map<string, Map<string, CobradorPendienteCorte>>()

  for (const c of cortes) {
    if (!c.user) continue
    const bId = c.user.branchId ?? c.branchId
    if (!bId) continue
    const diasAtraso = Math.floor((hoy.getTime() - c.fecha.getTime()) / 86_400_000)

    let branchMap = byBranch.get(bId)
    if (!branchMap) { branchMap = new Map(); byBranch.set(bId, branchMap) }

    let cob = branchMap.get(c.user.id)
    if (!cob) {
      cob = {
        userId: c.user.id,
        nombre: c.user.nombre,
        rol:    c.user.rol,
        cortes: [],
        diasMaxAtraso: 0,
        transferPendiente:      0,
        transferPendienteCount: 0,
        comisionApertura:       0,
        seguroApertura:         0,
      }
      branchMap.set(c.user.id, cob)
    }

    cob.cortes.push({
      corteId:               c.id,
      tipo:                  c.tipo as 'PARCIAL' | 'CONSOLIDADO',
      numeroCorte:           c.numeroCorte,
      fecha:                 c.fecha,
      diasAtraso,
      estado:                c.estado as 'ABIERTO' | 'ENTREGADO' | 'RECHAZADO',
      totalAEntregar:        Number(c.totalAEntregar),
      totalTransferValidada: Number(c.totalTransferenciaCobrado ?? 0),
      rechazoRazon:          c.rechazoRazon,
      receptorNombre:        c.receptor?.nombre ?? null,
    })
    if (diasAtraso > cob.diasMaxAtraso) cob.diasMaxAtraso = diasAtraso
  }

  // Para cada cobrador con pendientes, calcular desglose extra del día
  // más reciente del corte (típicamente ayer). El dato es informativo
  // para el radar — no se contabiliza al nivel de parcial individual.
  const allCobs: CobradorPendienteCorte[] = Array.from(byBranch.values())
    .flatMap((branchMap) => Array.from(branchMap.values()))
  for (const cob of allCobs) {
    const fechaMasReciente = cob.cortes
      .map((c: CortePendienteItem) => c.fecha)
      .sort((a: Date, b: Date) => b.getTime() - a.getTime())[0]
    if (!fechaMasReciente) continue
    const extra = await desgloseExtraDelDia(prisma, cob.userId, fechaMasReciente)
    cob.transferPendiente      = extra.transferPendiente
    cob.transferPendienteCount = extra.transferPendienteCount
    cob.comisionApertura       = extra.comisionApertura
    cob.seguroApertura         = extra.seguroApertura
  }

  // Caso especial: cobradores con transferencias PENDIENTES de verificar
  // de días anteriores que no tienen ningún corte abierto (porque el cron
  // no les crea CashRegister hasta que el GZ verifica). Para que
  // Dirección los vea en el radar y presione al GZ a verificar.
  // Ventana: hasta 30 días atrás. Más viejas se consideran abandonadas
  // (nunca se van a verificar) y solo ensucian el radar. Si en algún
  // momento Dirección necesita verlas, puede filtrar directo en /transferencias.
  const hace30Dias = new Date(hoy.getTime() - 30 * 24 * 60 * 60 * 1000)
  const transferPendientesViejas = await prisma.payment.findMany({
    where: {
      metodoPago:          'TRANSFER',
      statusTransferencia: 'PENDIENTE',
      canceledAt:          null,
      fechaHora:           { gte: hace30Dias, lt: hoy },
      loan:                { companyId },
      // Solo cobradores que siguen activos — ya no mostramos pendientes
      // de ex-empleados (Valentina et al). Si siguen pendientes en DB es
      // un problema contable aparte, no operativo.
      cobrador:            { activo: true },
    },
    select: {
      monto:     true,
      fechaHora: true,
      cobradorId: true,
      cobrador:  { select: { id: true, nombre: true, rol: true, branchId: true } },
      loan:      { select: { branchId: true } },
    },
  })
  for (const p of transferPendientesViejas) {
    const bId = p.cobrador.branchId ?? p.loan.branchId
    if (!bId) continue
    let branchMap = byBranch.get(bId)
    if (!branchMap) { branchMap = new Map(); byBranch.set(bId, branchMap) }
    let cob = branchMap.get(p.cobrador.id)
    if (!cob) {
      cob = {
        userId: p.cobrador.id,
        nombre: p.cobrador.nombre,
        rol:    p.cobrador.rol,
        cortes: [],
        diasMaxAtraso: 0,
        transferPendiente:      0,
        transferPendienteCount: 0,
        comisionApertura:       0,
        seguroApertura:         0,
      }
      branchMap.set(p.cobrador.id, cob)
    }
    cob.transferPendiente      += Number(p.monto)
    cob.transferPendienteCount += 1
    // Actualizar diasMaxAtraso usando la fecha del pago pendiente
    const dias = Math.floor((hoy.getTime() - p.fechaHora.getTime()) / 86_400_000)
    if (dias > cob.diasMaxAtraso) cob.diasMaxAtraso = dias
  }

  return branches
    .map((b): SucursalPendientesCortes => {
      const map = byBranch.get(b.id)
      const cobradores = map
        ? Array.from(map.values()).sort((a, b) => b.diasMaxAtraso - a.diasMaxAtraso)
        : []
      return { branchId: b.id, branchNombre: b.nombre, cobradores }
    })
    .filter((s) => s.cobradores.length > 0)
}

/**
 * Desglose extra que vive en la vista pero no en el modelo Corte:
 *   - transferenciasPendientes: TRANSFER capturadas por el user con
 *     statusTransferencia=PENDIENTE. No cuentan en totalAEntregar (no
 *     hay dinero físico que entregar) ni como transferencia validada
 *     (todavía no las confirma el GZ). Solo informativas.
 *   - comisiones / seguros: Payments con scheduleId=null que registran
 *     la tarifa de apertura. Se identifican por Payment.notas que
 *     contiene "Comisión de apertura" o "Seguro de apertura" (como lo
 *     escribe /api/loans/[id]/register-payment). SÍ cuentan en el
 *     totalEfectivoCobrado del corte, pero se desglosan aparte para
 *     que Dirección vea qué parte del efectivo fue cobros de cuota y
 *     qué parte fue apertura.
 *
 * Rango de fecha: todo el día CDMX (00:00 → 23:59). Para desglose por
 * parcial individual, filtrar en el caller usando el createdAt de los
 * parciales.
 */
export interface DesgloseExtraCorte {
  transferPendiente:       number
  transferPendienteCount:  number
  comisionApertura:        number
  comisionAperturaCount:   number
  seguroApertura:          number
  seguroAperturaCount:     number
}

export async function desgloseExtraDelDia(
  prisma: PrismaClient,
  userId: string,
  fecha: Date,
): Promise<DesgloseExtraCorte> {
  const inicioDia = fecha
  const finDia    = new Date(fecha.getTime() + 24 * 60 * 60 * 1000)

  const payments = await prisma.payment.findMany({
    where: {
      cobradorId: userId,
      canceledAt: null,
      fechaHora:  { gte: inicioDia, lt: finDia },
    },
    select: {
      monto:               true,
      metodoPago:          true,
      statusTransferencia: true,
      scheduleId:          true,
      notas:               true,
    },
  })

  let transferPendiente = 0, transferPendienteCount = 0
  let comisionApertura  = 0, comisionAperturaCount  = 0
  let seguroApertura    = 0, seguroAperturaCount    = 0

  for (const p of payments) {
    const monto = Number(p.monto)
    if (p.metodoPago === 'TRANSFER' && p.statusTransferencia === 'PENDIENTE') {
      transferPendiente += monto
      transferPendienteCount += 1
    }
    if (p.scheduleId === null) {
      const notas = (p.notas ?? '').toLowerCase()
      if (notas.includes('seguro'))         { seguroApertura   += monto; seguroAperturaCount   += 1 }
      else if (notas.includes('comisión'))  { comisionApertura += monto; comisionAperturaCount += 1 }
      else if (notas.includes('comision'))  { comisionApertura += monto; comisionAperturaCount += 1 }
    }
  }

  return {
    transferPendiente, transferPendienteCount,
    comisionApertura,  comisionAperturaCount,
    seguroApertura,    seguroAperturaCount,
  }
}

/**
 * Suma de cortes PARCIALES ACEPTADOS donde el receptor fue este user,
 * para la fecha dada. Es lo que un concentrador "recibió" de otros ese
 * día (excluye CONSOLIDADOS para no doble-contar).
 */
export async function totalRecibidoDeOtrosEnDia(
  prisma: PrismaClient,
  userId: string,
  fecha: Date,
): Promise<number> {
  const agg = await prisma.corte.aggregate({
    where: {
      receptorId: userId,
      fecha,
      estado: 'ACEPTADO',
      tipo:   'PARCIAL',
    },
    _sum: { montoAceptado: true },
  })
  return Number(agg._sum.montoAceptado ?? 0)
}

// ═════════════════════════════════════════════════════════════════════
//  REWORK (2026-10-27) — parciales + consolidado
// ═════════════════════════════════════════════════════════════════════

/**
 * Para el siguiente PARCIAL del día: cuánto cobró el user DESDE el
 * parcial anterior. Un parcial representa SOLO lo nuevo, no el
 * acumulado total del día (si no, se contaría doble al sumar los
 * parciales en el consolidado).
 *
 * Fórmula:
 *   cash register del día (total acumulado)
 *   − suma de totalEfectivoCobrado de parciales anteriores no-rechazados
 *   = efectivo nuevo para este parcial
 *
 * Lo mismo para tarjeta / transferencia (aunque esos no entran al
 * flujo físico, los capturamos para el ticket).
 */
export async function snapshotParcialIncremental(
  prisma: PrismaClient,
  userId: string,
  fecha: Date,
): Promise<{ efectivo: number; tarjeta: number; transferencia: number; recibidoDeOtros: number }> {
  const [reg, previos, recibidosPrev] = await Promise.all([
    prisma.cashRegister.findFirst({
      where:  { cobradorId: userId, fecha },
      select: { cobradoEfectivo: true, cobradoTarjeta: true, cobradoTransferencia: true },
    }),
    prisma.corte.aggregate({
      where: {
        userId, fecha, tipo: 'PARCIAL',
        estado: { in: ['ABIERTO', 'ENTREGADO', 'ACEPTADO'] },
      },
      _sum: {
        totalEfectivoCobrado:      true,
        totalTarjetaCobrado:       true,
        totalTransferenciaCobrado: true,
        totalRecibidoDeOtros:      true,
      },
    }),
    prisma.corte.aggregate({
      where: {
        receptorId: userId, fecha, tipo: 'PARCIAL',
        estado: 'ACEPTADO',
      },
      _sum: { montoAceptado: true },
    }),
  ])

  const totalEfectivoDia      = Number(reg?.cobradoEfectivo ?? 0)
  const totalTarjetaDia       = Number(reg?.cobradoTarjeta ?? 0)
  const totalTransferenciaDia = Number(reg?.cobradoTransferencia ?? 0)
  const yaCapturadoEfectivo      = Number(previos._sum.totalEfectivoCobrado ?? 0)
  const yaCapturadoTarjeta       = Number(previos._sum.totalTarjetaCobrado ?? 0)
  const yaCapturadoTransferencia = Number(previos._sum.totalTransferenciaCobrado ?? 0)
  const yaCapturadoRecibido      = Number(previos._sum.totalRecibidoDeOtros ?? 0)
  const totalRecibidoDia         = Number(recibidosPrev._sum.montoAceptado ?? 0)

  return {
    efectivo:        Math.max(0, totalEfectivoDia      - yaCapturadoEfectivo),
    tarjeta:         Math.max(0, totalTarjetaDia       - yaCapturadoTarjeta),
    transferencia:   Math.max(0, totalTransferenciaDia - yaCapturadoTransferencia),
    recibidoDeOtros: Math.max(0, totalRecibidoDia      - yaCapturadoRecibido),
  }
}

/**
 * Para la CONCENTRADORA: cuánto efectivo propio llevan cobrado en
 * la semana MK (sábado → hoy) que todavía NO entró a un parcial.
 * Se usa el viernes al Iniciar Consolidado para crear automáticamente
 * un parcial propio con el residuo antes de agrupar.
 *
 * Fórmula:
 *   SUM(cashRegister.cobradoEfectivo) sabado..hoy
 *   − SUM(corte.totalEfectivoCobrado) parciales propios no-rechazados sabado..hoy
 *   = residuo propio pendiente
 */
export async function efectivoPropioResiduoSemana(
  prisma: PrismaClient,
  userId: string,
  fecha: Date,
): Promise<{ efectivo: number; tarjeta: number; transferencia: number; desde: Date }> {
  const desde = inicioSemanaMk(fecha)
  const [regs, previos] = await Promise.all([
    prisma.cashRegister.aggregate({
      where: {
        cobradorId: userId,
        fecha: { gte: desde, lte: fecha },
      },
      _sum: {
        cobradoEfectivo:      true,
        cobradoTarjeta:       true,
        cobradoTransferencia: true,
      },
    }),
    prisma.corte.aggregate({
      where: {
        userId,
        tipo: 'PARCIAL',
        fecha: { gte: desde, lte: fecha },
        estado: { in: ['ABIERTO', 'ENTREGADO', 'ACEPTADO'] },
      },
      _sum: {
        totalEfectivoCobrado:      true,
        totalTarjetaCobrado:       true,
        totalTransferenciaCobrado: true,
      },
    }),
  ])
  return {
    efectivo:      Math.max(0, Number(regs._sum.cobradoEfectivo ?? 0)      - Number(previos._sum.totalEfectivoCobrado ?? 0)),
    tarjeta:       Math.max(0, Number(regs._sum.cobradoTarjeta ?? 0)       - Number(previos._sum.totalTarjetaCobrado ?? 0)),
    transferencia: Math.max(0, Number(regs._sum.cobradoTransferencia ?? 0) - Number(previos._sum.totalTransferenciaCobrado ?? 0)),
    desde,
  }
}

/**
 * Siguiente número de corte para user+fecha+tipo. Primer parcial del
 * día es 1, segundo es 2, etc. Igual para consolidados.
 */
export async function siguienteNumeroCorte(
  prisma: PrismaClient,
  userId: string,
  fecha: Date,
  tipo: 'PARCIAL' | 'CONSOLIDADO',
): Promise<number> {
  const last = await prisma.corte.findFirst({
    where:   { userId, fecha, tipo },
    orderBy: { numeroCorte: 'desc' },
    select:  { numeroCorte: true },
  })
  return (last?.numeroCorte ?? 0) + 1
}

/**
 * Parciales ACEPTADOS del día en los que el `concentradoraId` fue
 * receptor Y que NO estén ya en un consolidado (padre null o padre
 * rechazado). Son los candidatos a agruparse en el próximo consolidado.
 */
export async function parcialesParaConsolidar(
  prisma: PrismaClient,
  concentradoraId: string,
  fecha: Date,
): Promise<Array<{ id: string; userId: string; montoAceptado: number }>> {
  // La semana MK va de sábado 00:00 CDMX al viernes 23:59. El
  // consolidado agrupa TODOS los parciales ACEPTADOS de esa ventana
  // (coord → concentradora durante la semana) y se entrega los viernes
  // cuando Dirección hace corte con concentradores.
  const semanaDesde = inicioSemanaMk(fecha)
  const rows = await prisma.corte.findMany({
    where: {
      receptorId:         concentradoraId,
      fecha:              { gte: semanaDesde, lte: fecha },
      tipo:               'PARCIAL',
      estado:             'ACEPTADO',
      consolidadoPadreId: null,
    },
    select: { id: true, userId: true, montoAceptado: true },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map((r) => ({
    id:            r.id,
    userId:        r.userId,
    montoAceptado: Number(r.montoAceptado ?? 0),
  }))
}

// ═════════════════════════════════════════════════════════════════════
//  DESGLOSE DE UN CORTE — "de dónde salen las cifras"
// ═════════════════════════════════════════════════════════════════════

export interface DesglosePagoCuota {
  paymentId:          string
  clienteNombre:      string
  numeroPago:         number | null
  monto:              number
  metodoPago:         string
  statusTransferencia: string | null
  fechaHora:          string
  cobradorNombre:     string
}

export interface DesglosePagoApertura {
  paymentId:     string
  clienteNombre: string
  tipo:          'SEGURO' | 'COMISION'
  monto:         number
  metodoPago:    string
  fechaHora:     string
  cobradorNombre: string
}

export interface DesgloseMora {
  moraCobroId:   string
  clienteNombre: string
  tipo:          string   // 'MULTA' | 'MORA'
  monto:         number
  cobrada:       boolean
  fechaHora:     string | null
  cobradorNombre: string
}

export interface DesgloseTransferPendiente {
  paymentId:       string
  clienteNombre:   string
  monto:           number
  fechaHora:       string
  idTransferencia: string | null
  cobradorNombre:  string
}

export interface DesgloseVentanaInfo {
  userId:          string
  cobradorNombre:  string
  desde:           string | null  // ISO; null si es parcial #1 (todo el día)
  hasta:           string         // ISO
  parcialNumero?:  number
  parcialId?:      string
}

export interface DesgloseCorte {
  corteId:       string
  tipo:          'PARCIAL' | 'CONSOLIDADO'
  numeroCorte:   number
  fecha:         string
  estado:        string
  totalAEntregar:            number
  totalEfectivoCobrado:      number
  totalTarjetaCobrado:       number
  totalTransferenciaCobrado: number
  totalRecibidoDeOtros:      number
  userNombre:    string
  branchNombre:  string | null
  ventanas:      DesgloseVentanaInfo[]
  pagosCuotas:          DesglosePagoCuota[]
  segurosYComisiones:   DesglosePagoApertura[]
  moras:                DesgloseMora[]
  transferPendientes:   DesgloseTransferPendiente[]
  parcialesHijos?: Array<{
    id:              string
    numeroCorte:     number
    userNombre:      string
    totalAEntregar:  number
    estado:          string
  }>
  totales: {
    pagosCuotasMonto:        number
    pagosCuotasCount:        number
    segurosMonto:            number
    segurosCount:            number
    comisionesMonto:         number
    comisionesCount:         number
    morasMonto:              number
    morasCount:              number
    transferPendientesMonto: number
    transferPendientesCount: number
  }
}

/**
 * Devuelve el desglose completo de un corte para auditoría.
 *
 *   PARCIAL:     ventana = (createdAt del parcial N-1 del mismo user en
 *                la misma fecha; createdAt de este]. Si es el #1 del día,
 *                desde 00:00 CDMX de la fecha.
 *   CONSOLIDADO: unión de las ventanas de cada parcial hijo (el consolidado
 *                NO abre ventana propia — todo pasa por sus parciales).
 *
 * Incluye:
 *   - pagosCuotas:         pagos a schedule (cliente, # pago, monto, método)
 *   - segurosYComisiones:  payments con scheduleId=null (apertura)
 *   - moras:               MoraCobro cuyo paymentCobro cae en la ventana
 *   - transferPendientes:  payments TRANSFER PENDIENTE en la ventana
 */
export async function desgloseCorte(
  prisma: PrismaClient,
  corteId: string,
): Promise<DesgloseCorte | null> {
  const corte = await prisma.corte.findUnique({
    where:  { id: corteId },
    include: {
      user:   { select: { id: true, nombre: true } },
      branch: { select: { nombre: true } },
      consolidadoHijos: {
        select: {
          id: true, numeroCorte: true, totalAEntregar: true, estado: true, createdAt: true,
          userId: true, fecha: true,
          user: { select: { id: true, nombre: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!corte) return null

  type Vent = { userId: string; cobradorNombre: string; desde: Date | null; hasta: Date; parcialNumero?: number; parcialId?: string }
  const ventanas: Vent[] = []
  if (corte.tipo === 'PARCIAL') {
    const anterior = await prisma.corte.findFirst({
      where: {
        userId:      corte.userId,
        fecha:       corte.fecha,
        tipo:        'PARCIAL',
        numeroCorte: { lt: corte.numeroCorte },
      },
      orderBy: { numeroCorte: 'desc' },
      select:  { createdAt: true },
    })
    ventanas.push({
      userId:         corte.userId,
      cobradorNombre: corte.user?.nombre ?? '—',
      desde:          anterior?.createdAt ?? null,
      hasta:          corte.createdAt,
      parcialNumero:  corte.numeroCorte,
      parcialId:      corte.id,
    })
  } else {
    for (const h of corte.consolidadoHijos) {
      const anterior = await prisma.corte.findFirst({
        where: {
          userId:      h.userId,
          fecha:       h.fecha,
          tipo:        'PARCIAL',
          numeroCorte: { lt: h.numeroCorte },
        },
        orderBy: { numeroCorte: 'desc' },
        select:  { createdAt: true },
      })
      ventanas.push({
        userId:         h.userId,
        cobradorNombre: h.user?.nombre ?? '—',
        desde:          anterior?.createdAt ?? null,
        hasta:          h.createdAt,
        parcialNumero:  h.numeroCorte,
        parcialId:      h.id,
      })
    }
  }

  // Para cada ventana con desde=null, usamos la fecha del corte como piso.
  const inicioDia = new Date(corte.fecha)
  const paymentWhereOr = ventanas.map((v) => ({
    cobradorId: v.userId,
    fechaHora:  { gt: v.desde ?? inicioDia, lte: v.hasta },
  }))

  if (paymentWhereOr.length === 0) {
    return baseDesglose(corte, [], [], [], [], [])
  }

  const payments = await prisma.payment.findMany({
    where: {
      canceledAt: null,
      OR:         paymentWhereOr,
    },
    select: {
      id:                  true,
      monto:               true,
      metodoPago:          true,
      statusTransferencia: true,
      scheduleId:          true,
      notas:               true,
      fechaHora:           true,
      idTransferencia:     true,
      cobradorId:          true,
      cobrador:  { select: { nombre: true } },
      client:    { select: { nombreCompleto: true } },
      schedule:  { select: { numeroPago: true } },
    },
    orderBy: { fechaHora: 'asc' },
  })

  const pagosCuotas: DesglosePagoCuota[] = []
  const segurosYComisiones: DesglosePagoApertura[] = []
  const transferPendientes: DesgloseTransferPendiente[] = []
  for (const p of payments) {
    const monto = Number(p.monto)
    const notas = (p.notas ?? '').toLowerCase()
    const esApertura = p.scheduleId === null && (notas.includes('seguro') || notas.includes('comisión') || notas.includes('comision'))
    if (esApertura) {
      segurosYComisiones.push({
        paymentId:      p.id,
        clienteNombre:  p.client.nombreCompleto,
        tipo:           notas.includes('seguro') ? 'SEGURO' : 'COMISION',
        monto,
        metodoPago:     p.metodoPago,
        fechaHora:      p.fechaHora.toISOString(),
        cobradorNombre: p.cobrador?.nombre ?? '—',
      })
    } else {
      pagosCuotas.push({
        paymentId:           p.id,
        clienteNombre:       p.client.nombreCompleto,
        numeroPago:          p.schedule?.numeroPago ?? null,
        monto,
        metodoPago:          p.metodoPago,
        statusTransferencia: p.statusTransferencia,
        fechaHora:           p.fechaHora.toISOString(),
        cobradorNombre:      p.cobrador?.nombre ?? '—',
      })
      if (p.metodoPago === 'TRANSFER' && p.statusTransferencia === 'PENDIENTE') {
        transferPendientes.push({
          paymentId:       p.id,
          clienteNombre:   p.client.nombreCompleto,
          monto,
          fechaHora:       p.fechaHora.toISOString(),
          idTransferencia: p.idTransferencia,
          cobradorNombre:  p.cobrador?.nombre ?? '—',
        })
      }
    }
  }

  const paymentIds = payments.map((p) => p.id)
  const morasRows = paymentIds.length > 0
    ? await prisma.moraCobro.findMany({
        where:  { paymentCobroId: { in: paymentIds } },
        select: {
          id:        true,
          tipo:      true,
          monto:     true,
          cobrada:   true,
          cobradaAt: true,
          cobrador:  { select: { nombre: true } },
          client:    { select: { nombreCompleto: true } },
        },
        orderBy: { cobradaAt: 'asc' },
      })
    : []
  const moras: DesgloseMora[] = morasRows.map((m) => ({
    moraCobroId:    m.id,
    clienteNombre:  m.client.nombreCompleto,
    tipo:           m.tipo,
    monto:          Number(m.monto),
    cobrada:        m.cobrada,
    fechaHora:      m.cobradaAt?.toISOString() ?? null,
    cobradorNombre: m.cobrador?.nombre ?? '—',
  }))

  return baseDesglose(corte, ventanas, pagosCuotas, segurosYComisiones, moras, transferPendientes)
}

function baseDesglose(
  corte: {
    id: string
    tipo: string
    numeroCorte: number
    fecha: Date
    estado: string
    totalAEntregar: unknown
    totalEfectivoCobrado: unknown
    totalTarjetaCobrado: unknown
    totalTransferenciaCobrado: unknown
    totalRecibidoDeOtros: unknown
    createdAt: Date
    user: { nombre: string } | null
    branch: { nombre: string } | null
    consolidadoHijos: Array<{
      id: string
      numeroCorte: number
      totalAEntregar: unknown
      estado: string
      user: { nombre: string } | null
    }>
  },
  ventanas: Array<{ userId: string; cobradorNombre: string; desde: Date | null; hasta: Date; parcialNumero?: number; parcialId?: string }>,
  pagosCuotas: DesglosePagoCuota[],
  segurosYComisiones: DesglosePagoApertura[],
  moras: DesgloseMora[],
  transferPendientes: DesgloseTransferPendiente[],
): DesgloseCorte {
  const seguros    = segurosYComisiones.filter((x) => x.tipo === 'SEGURO')
  const comisiones = segurosYComisiones.filter((x) => x.tipo === 'COMISION')
  return {
    corteId:      corte.id,
    tipo:         corte.tipo as 'PARCIAL' | 'CONSOLIDADO',
    numeroCorte:  corte.numeroCorte,
    fecha:        corte.fecha.toISOString().slice(0, 10),
    estado:       corte.estado,
    totalAEntregar:            Number(corte.totalAEntregar),
    totalEfectivoCobrado:      Number(corte.totalEfectivoCobrado),
    totalTarjetaCobrado:       Number(corte.totalTarjetaCobrado),
    totalTransferenciaCobrado: Number(corte.totalTransferenciaCobrado),
    totalRecibidoDeOtros:      Number(corte.totalRecibidoDeOtros),
    userNombre:   corte.user?.nombre ?? '—',
    branchNombre: corte.branch?.nombre ?? null,
    ventanas: ventanas.map((v) => ({
      userId:         v.userId,
      cobradorNombre: v.cobradorNombre,
      desde:          v.desde?.toISOString() ?? null,
      hasta:          v.hasta.toISOString(),
      parcialNumero:  v.parcialNumero,
      parcialId:      v.parcialId,
    })),
    pagosCuotas,
    segurosYComisiones,
    moras,
    transferPendientes,
    parcialesHijos: corte.consolidadoHijos.length > 0
      ? corte.consolidadoHijos.map((h) => ({
          id:             h.id,
          numeroCorte:    h.numeroCorte,
          userNombre:     h.user?.nombre ?? '—',
          totalAEntregar: Number(h.totalAEntregar),
          estado:         h.estado,
        }))
      : undefined,
    totales: {
      pagosCuotasMonto:        pagosCuotas.reduce((s, p) => s + p.monto, 0),
      pagosCuotasCount:        pagosCuotas.length,
      segurosMonto:            seguros.reduce((s, x) => s + x.monto, 0),
      segurosCount:            seguros.length,
      comisionesMonto:         comisiones.reduce((s, x) => s + x.monto, 0),
      comisionesCount:         comisiones.length,
      morasMonto:              moras.reduce((s, m) => s + m.monto, 0),
      morasCount:              moras.length,
      transferPendientesMonto: transferPendientes.reduce((s, t) => s + t.monto, 0),
      transferPendientesCount: transferPendientes.length,
    },
  }
}
