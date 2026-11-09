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
import { loanNotDeletedWhere } from '@/lib/access'

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
 *
 * Modelo semanal MK: el coord cobra toda la semana (sáb→vie) y entrega
 * su parcial a la concentradora los VIERNES (puede adelantar entre
 * semana si junta mucho efectivo, pero no es obligatorio). La
 * concentradora consolida los viernes y entrega a DG/DC.
 *
 * Reglas de bloqueo (todas evaluadas contra la semana MK YA CERRADA):
 *   - PROPIO: el user tiene un parcial ABIERTO o RECHAZADO cuya fecha
 *     cae ≤ viernes anterior. Es un corte real sin cerrar — tiene que
 *     entregarlo / corregirlo. Los parciales ABIERTO vacíos (sin dinero
 *     que entregar) no cuentan.
 *   - SEMANAL_SIN_CERRAR: la semana que acaba de cerrar tiene cobranza
 *     del user (CashRegister sum > 0) y NO hay NINGÚN parcial ACEPTADO
 *     con fecha dentro de esa semana. Es decir, el viernes pasó y nunca
 *     entregó nada. No hay corteId concreto — el UI debe mandarlo a
 *     /corte-del-dia para que inicie uno y lo entregue.
 *
 * Lo que ocurre dentro de la semana en curso (sáb → vie) NO bloquea.
 * El coord guarda el efectivo y el viernes mismo entrega. DG/DC/SA
 * nunca se bloquean.
 */
export async function cortePendienteDe(
  prisma: PrismaClient,
  user: { id: string; rol: string },
): Promise<{ id: string; tipo: 'PROPIO' | 'SEMANAL_SIN_CERRAR' } | null> {
  if (esReceptorFinal(user.rol)) return null
  if (!debeHacerCorte(user.rol)) return null

  const hoy = todayMx()
  const inicioSemActual = inicioSemanaMk(hoy)                       // sábado 00:00 CDMX
  const inicioSemAnterior = new Date(inicioSemActual.getTime() - 7 * 24 * 60 * 60 * 1000)
  // Viernes anterior (último día de la semana cerrada). Lo tratamos como
  // día civil para que `fecha <= viernesAnterior` incluya ese día entero.
  const viernesAnterior = new Date(inicioSemActual.getTime() - 24 * 60 * 60 * 1000)

  // 1. PROPIO — parcial ABIERTO/RECHAZADO de semana cerrada o anterior.
  // Ignoramos los ABIERTO con totalAEntregar=0 (parciales vacíos) y
  // también los ABIERTO que coexisten con otro parcial ENTREGADO o
  // ACEPTADO del user en la MISMA semana MK (sáb→vie). Ese segundo
  // caso cubre el parcial "fantasma" que crea el cron de los viernes
  // a las 18:00 CDMX con el residuo acumulado cuando el user ya
  // entregó manualmente antes: el cron agrega un parcial auto con el
  // extra, el user no lo vio, y el lunes el sistema lo bloqueaba
  // aunque ya hubiera entregado lo del ciclo.
  const candidatos = await prisma.corte.findMany({
    where: {
      userId: user.id,
      estado: { in: ['ABIERTO', 'RECHAZADO'] },
      fecha:  { lte: viernesAnterior },
      NOT: {
        AND: [
          { estado: 'ABIERTO' },
          { totalAEntregar: 0 },
        ],
      },
    },
    orderBy: { fecha: 'asc' },
    select:  { id: true, estado: true, fecha: true },
  })
  for (const cand of candidatos) {
    const semanaSab = inicioSemanaMk(cand.fecha)
    const semanaVie = new Date(semanaSab.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)
    // "Ya cerró la semana" = existe otro Corte del user, de cualquier
    // tipo (PARCIAL para coord normal, CONSOLIDADO para concentradora),
    // en ENTREGADO o ACEPTADO, dentro de la misma semana MK del
    // candidato. Antes se restringía a tipo=PARCIAL y dejaba fuera a
    // las concentradoras: Carol entregaba su CONSOLIDADO el viernes
    // pero el lunes seguía bloqueada porque el check buscaba un
    // PARCIAL cerrado y no lo encontraba.
    const otro = await prisma.corte.findFirst({
      where: {
        userId: user.id,
        tipo:   { in: ['PARCIAL', 'CONSOLIDADO'] },
        estado: { in: ['ENTREGADO', 'ACEPTADO'] },
        fecha:  { gte: semanaSab, lte: semanaVie },
        id:     { not: cand.id },
      },
      select: { id: true },
    })
    if (otro) continue  // ya cerró la semana, este ABIERTO es residuo
    return { id: cand.id, tipo: 'PROPIO' }
  }

  // 2. SEMANAL_SIN_CERRAR — hubo cobranza en la semana que acaba de
  // cerrar (sábado anterior → viernes anterior) pero el user no cerró
  // ningún parcial ACEPTADO en esa ventana. La semana en curso NUNCA
  // se evalúa aquí porque `inicioSemanaMk(hoy)` corta a sábado 00:00
  // de la semana donde cae `hoy`, así que `viernesAnterior` siempre
  // apunta al viernes pasado.
  //
  // AMNISTÍA DE TRANSICIÓN: el modelo semanal arranca formalmente el
  // sábado 7-nov-2026. Antes de esa fecha los coord trabajaban con
  // bloqueo DIARIO y no tenían obligación de cerrar un parcial cada
  // viernes. Para no bloquearlos por semanas viejas que terminaron
  // bajo el modelo anterior, sólo evaluamos esta rama cuando la
  // semana a auditar inicia el 7-nov o después.
  const INICIO_MODELO_SEMANAL = new Date('2026-11-07T06:00:00.000Z')  // sábado 7-nov 00:00 CDMX
  if (inicioSemAnterior.getTime() < INICIO_MODELO_SEMANAL.getTime()) {
    return null
  }

  const cobranza = await prisma.cashRegister.aggregate({
    where: {
      cobradorId: user.id,
      fecha:      { gte: inicioSemAnterior, lte: viernesAnterior },
    },
    _sum: {
      cobradoEfectivo:      true,
      cobradoTarjeta:       true,
      cobradoTransferencia: true,
    },
  })
  const totalCobrado =
    Number(cobranza._sum.cobradoEfectivo      ?? 0) +
    Number(cobranza._sum.cobradoTarjeta       ?? 0) +
    Number(cobranza._sum.cobradoTransferencia ?? 0)
  if (totalCobrado <= 0) return null

  // Antes se exigía PARCIAL ACEPTADO. Pero: (a) si el coord entregó y
  // la concentradora todavía no acepta, no es culpa del coord — ya hizo
  // su parte; y (b) una concentradora cierra su semana con un
  // CONSOLIDADO, no con un PARCIAL. Contamos cualquier tipo en
  // ENTREGADO o ACEPTADO.
  const algunoEntregado = await prisma.corte.findFirst({
    where: {
      userId: user.id,
      tipo:   { in: ['PARCIAL', 'CONSOLIDADO'] },
      estado: { in: ['ENTREGADO', 'ACEPTADO'] },
      fecha:  { gte: inicioSemAnterior, lte: viernesAnterior },
    },
    select: { id: true },
  })
  if (!algunoEntregado) {
    return { id: 'SEMANAL_SIN_CERRAR', tipo: 'SEMANAL_SIN_CERRAR' }
  }

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
  // Semana MK que acaba de cerrar. En el modelo semanal el panel solo
  // muestra lo que quedó colgando del viernes pasado — lo de la semana
  // en curso NO es pendiente aún (el coord guarda su efectivo hasta el
  // viernes).
  const inicioSemActual   = inicioSemanaMk(hoy)
  const viernesAnterior   = new Date(inicioSemActual.getTime() - 24 * 60 * 60 * 1000)
  const inicioSemAnterior = new Date(inicioSemActual.getTime() - 7 * 24 * 60 * 60 * 1000)

  const branches = await prisma.branch.findMany({
    where:  { companyId, activa: true },
    select: { id: true, nombre: true },
    orderBy:{ nombre: 'asc' },
  })

  const cortes = await prisma.corte.findMany({
    where: {
      companyId,
      fecha:  { lte: viernesAnterior },
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

  // Semanal: cobradores con cobranza en la semana ya cerrada que NO
  // abrieron ningún parcial ACEPTADO para entregarla. No existen como
  // filas de Corte (nunca iniciaron uno), así que hay que detectarlos
  // vía CashRegister. Se agregan como "fantasmas" sin corteId concreto.
  //
  // AMNISTÍA DE TRANSICIÓN (igual que `cortePendienteDe`): el modelo
  // semanal arranca formalmente el sábado 7-nov-2026. No se audita
  // semana anterior a esa fecha para no listar coord fantasma de
  // ciclos bajo el modelo diario viejo.
  const INICIO_MODELO_SEMANAL_PANEL = new Date('2026-11-07T06:00:00.000Z')
  const cashSemAnterior = inicioSemAnterior.getTime() < INICIO_MODELO_SEMANAL_PANEL.getTime()
    ? []
    : await prisma.cashRegister.findMany({
    where: {
      fecha:    { gte: inicioSemAnterior, lte: viernesAnterior },
      cobrador: { companyId, activo: true },
    },
    select: {
      cobradorId:           true,
      branchId:             true,
      cobradoEfectivo:      true,
      cobradoTarjeta:       true,
      cobradoTransferencia: true,
      cobrador:             { select: { id: true, nombre: true, rol: true, branchId: true } },
      branch:               { select: { id: true, nombre: true } },
    },
  })
  const semByUser = new Map<string, { totalCobrado: number; branchId: string; branchNombre: string; cobradorNombre: string; cobradorRol: string }>()
  for (const r of cashSemAnterior) {
    const prev = semByUser.get(r.cobradorId) ?? {
      totalCobrado:    0,
      branchId:        r.cobrador.branchId ?? r.branchId,
      branchNombre:    r.branch?.nombre ?? '',
      cobradorNombre:  r.cobrador.nombre,
      cobradorRol:     r.cobrador.rol,
    }
    prev.totalCobrado += Number(r.cobradoEfectivo) + Number(r.cobradoTarjeta) + Number(r.cobradoTransferencia)
    semByUser.set(r.cobradorId, prev)
  }
  const candidatos = Array.from(semByUser.entries()).filter(([, v]) => v.totalCobrado > 0)
  if (candidatos.length > 0) {
    const parcialesCerrados = await prisma.corte.findMany({
      where: {
        userId: { in: candidatos.map(([uid]) => uid) },
        tipo:   'PARCIAL',
        estado: 'ACEPTADO',
        fecha:  { gte: inicioSemAnterior, lte: viernesAnterior },
      },
      select: { userId: true },
    })
    const cerradoSet = new Set(parcialesCerrados.map((p) => p.userId))
    const semanalesViernes = Math.max(1, Math.floor((hoy.getTime() - viernesAnterior.getTime()) / 86_400_000))
    for (const [uid, info] of candidatos) {
      if (cerradoSet.has(uid)) continue
      if (!info.branchId) continue
      let branchMap = byBranch.get(info.branchId)
      if (!branchMap) { branchMap = new Map(); byBranch.set(info.branchId, branchMap) }
      let cob = branchMap.get(uid)
      if (!cob) {
        cob = {
          userId: uid,
          nombre: info.cobradorNombre,
          rol:    info.cobradorRol,
          cortes: [],
          diasMaxAtraso: semanalesViernes,
          transferPendiente:      0,
          transferPendienteCount: 0,
          comisionApertura:       0,
          seguroApertura:         0,
        }
        branchMap.set(uid, cob)
      }
      // Marcador: parcial "fantasma" ABIERTO con fecha del viernes pasado
      // y monto total cobrado. No existe en DB; es solo para el radar.
      cob.cortes.push({
        corteId:               `SEMANAL:${uid}`,
        tipo:                  'PARCIAL',
        numeroCorte:           0,
        fecha:                 viernesAnterior,
        diasAtraso:            semanalesViernes,
        estado:                'ABIERTO',
        totalAEntregar:        info.totalCobrado,
        totalTransferValidada: 0,
        rechazoRazon:          null,
        receptorNombre:        null,
      })
      if (semanalesViernes > cob.diasMaxAtraso) cob.diasMaxAtraso = semanalesViernes
    }
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
 * Semanal MK: lo que un coord lleva cobrado en la semana (sáb→hoy)
 * menos lo que ya metió en parciales previos no-rechazados de esa
 * misma semana, menos lo ya "recibido de otros" que haya capturado en
 * parciales previos. Es el reemplazo semanal de
 * snapshotParcialIncremental (que solo veía el día actual).
 *
 * Fórmula:
 *   SUM(CashRegister)        sáb..hoy   (cobradoEfectivo/Tarjeta/Transfer)
 * − SUM(Corte propios)       sáb..hoy   (totalEfectivo/Tarjeta/Transfer, no-RECHAZADO)
 *   = efectivo/tarjeta/transfer nuevo para este parcial
 *
 * Para "recibido de otros":
 *   SUM(Corte recibidos ACEPTADO) sáb..hoy  (montoAceptado)
 * − SUM(Corte propios no-RECHAZADO totalRecibidoDeOtros) sáb..hoy
 */
export async function snapshotParcialSemanalIncremental(
  prisma: PrismaClient,
  userId: string,
  fecha: Date,
): Promise<{ efectivo: number; tarjeta: number; transferencia: number; recibidoDeOtros: number; desde: Date }> {
  const desde = inicioSemanaMk(fecha)
  const [regs, previos, recibidosPrev] = await Promise.all([
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
        totalRecibidoDeOtros:      true,
      },
    }),
    prisma.corte.aggregate({
      where: {
        receptorId: userId,
        tipo: 'PARCIAL',
        fecha: { gte: desde, lte: fecha },
        estado: 'ACEPTADO',
      },
      _sum: { montoAceptado: true },
    }),
  ])
  const totalEfectivoSem      = Number(regs._sum.cobradoEfectivo ?? 0)
  const totalTarjetaSem       = Number(regs._sum.cobradoTarjeta ?? 0)
  const totalTransferSem      = Number(regs._sum.cobradoTransferencia ?? 0)
  const yaEfectivo    = Number(previos._sum.totalEfectivoCobrado ?? 0)
  const yaTarjeta     = Number(previos._sum.totalTarjetaCobrado ?? 0)
  const yaTransfer    = Number(previos._sum.totalTransferenciaCobrado ?? 0)
  const yaRecibido    = Number(previos._sum.totalRecibidoDeOtros ?? 0)
  const recibidoSem   = Number(recibidosPrev._sum.montoAceptado ?? 0)
  return {
    efectivo:        Math.max(0, totalEfectivoSem - yaEfectivo),
    tarjeta:         Math.max(0, totalTarjetaSem  - yaTarjeta),
    transferencia:   Math.max(0, totalTransferSem - yaTransfer),
    recibidoDeOtros: Math.max(0, recibidoSem      - yaRecibido),
    desde,
  }
}

/**
 * ¿El user ya entregó su corte del día y por lo tanto queda BLOQUEADO
 * para registrar nuevos cobros el resto del día?
 *
 *  - Coord normal: tiene al menos un Corte PARCIAL con fecha=hoy en
 *    estado ENTREGADO o ACEPTADO.
 *  - Concentradora local: tiene un Corte CONSOLIDADO con fecha=hoy en
 *    ENTREGADO o ACEPTADO. (Sus parciales propios se auto-aceptan al
 *    iniciarlos; usarlos como guard la bloquearía apenas abriera el
 *    primer parcial del día.)
 *
 * DG / DC / SUPER_ADMIN nunca se bloquean.
 */
export async function yaEntregoCorteHoy(
  prisma: PrismaClient,
  user: { id: string; rol: string; branchId: string | null },
): Promise<{ bloqueado: boolean; corteId?: string; tipo?: 'PARCIAL' | 'CONSOLIDADO' }> {
  if (esReceptorFinal(user.rol)) return { bloqueado: false }
  if (!debeHacerCorte(user.rol)) return { bloqueado: false }
  if (!user.branchId) return { bloqueado: false }

  const hoy = todayMx()
  const concentrador = await concentradorDeSucursal(prisma, user.branchId)
  const esConcentrador = concentrador?.id === user.id

  const tipo: 'PARCIAL' | 'CONSOLIDADO' = esConcentrador ? 'CONSOLIDADO' : 'PARCIAL'
  const row = await prisma.corte.findFirst({
    where: {
      userId: user.id,
      fecha:  hoy,
      tipo,
      estado: { in: ['ENTREGADO', 'ACEPTADO'] },
    },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
  })
  if (!row) return { bloqueado: false }
  return { bloqueado: true, corteId: row.id, tipo }
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

// ═════════════════════════════════════════════════════════════════════
//  NETO BANCA — fuente de verdad del consolidado del viernes
// ═════════════════════════════════════════════════════════════════════

/**
 * Qué debe entregar la concentradora al DG/DC este viernes, calculado
 * EXACTAMENTE con la misma fórmula que la vista Banca:
 *
 *   Neto = Σ Payment(CASH+CARD)      // dinero físico que entró en semana
 *        + Σ BranchExtraFund          // aportes de Dirección
 *        − Σ Loan.montoReal           // desembolsos netos
 *        − Σ BranchWithdrawal         // retiros de Dirección
 *
 * Suma TODAS las sucursales donde el user figura como concentrador.
 * Para una concentradora con varias sucursales (ej. Carol ↔ Tenancingo II
 * + Minatitlán) agrega el Neto de cada una.
 *
 * Transferencias se reportan aparte (son informativas — ya entraron al
 * banco directo) y NO forman parte del Neto a entregar en físico.
 *
 * Decisión Dirección 2026-11: el consolidado deja de ser "suma de
 * parciales aceptados" (no cuadraba con Banca porque los parciales
 * agregaban efectivo + transferencias sin restar desembolsos ni sumar
 * adicionales). El dinero que efectivamente debe llegar a Dirección es
 * el Neto Banca de la semana, no la suma de parciales.
 */
export async function netoBancaConcentradoraSemana(
  prisma: PrismaClient,
  userId: string,
  fecha: Date,
): Promise<{
  branchIds:            string[]
  branchNombres:        string[]
  desde:                Date
  hasta:                Date
  totalCortes:          number  // efectivo + tarjeta (físico)
  totalTransferencia:   number  // informativo
  totalDesembolsos:     number
  totalAdicional:       number
  totalRetiro:          number
  neto:                 number
}> {
  const desde = inicioSemanaMk(fecha)
  // Viernes 23:59:59 CDMX = sábado siguiente 05:59:59 UTC
  const hasta = new Date(desde.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)

  const branches = await prisma.branch.findMany({
    where:  { concentradorUserId: userId, activa: true },
    select: { id: true, nombre: true },
  })
  const branchIds = branches.map((b) => b.id)
  if (branchIds.length === 0) {
    return {
      branchIds: [], branchNombres: [], desde, hasta,
      totalCortes: 0, totalTransferencia: 0,
      totalDesembolsos: 0, totalAdicional: 0, totalRetiro: 0, neto: 0,
    }
  }

  const [pagosCashCard, pagosTransfer, desembolsos, adicionales, retiros] = await Promise.all([
    prisma.payment.aggregate({
      where: {
        canceledAt: null,
        fechaHora: { gte: desde, lte: hasta },
        metodoPago: { in: ['CASH', 'CARD'] },
        loan: { branchId: { in: branchIds }, AND: [loanNotDeletedWhere] },
      },
      _sum: { monto: true },
    }),
    prisma.payment.aggregate({
      where: {
        canceledAt: null,
        fechaHora: { gte: desde, lte: hasta },
        metodoPago: 'TRANSFER',
        loan: { branchId: { in: branchIds }, AND: [loanNotDeletedWhere] },
      },
      _sum: { monto: true },
    }),
    prisma.loan.aggregate({
      where: {
        branchId: { in: branchIds },
        AND: [loanNotDeletedWhere],
        fechaDesembolso: { gte: desde, lte: hasta },
        estado: { in: ['ACTIVE', 'LIQUIDATED', 'RESTRUCTURED', 'DEFAULTED'] },
      },
      _sum: { montoReal: true },
    }),
    prisma.branchExtraFund.aggregate({
      where: { branchId: { in: branchIds }, fecha: { gte: desde, lte: hasta } },
      _sum:  { monto: true },
    }),
    prisma.branchWithdrawal.aggregate({
      where: { branchId: { in: branchIds }, fecha: { gte: desde, lte: hasta } },
      _sum:  { monto: true },
    }),
  ])

  const totalCortes         = Number(pagosCashCard._sum.monto ?? 0)
  const totalTransferencia  = Number(pagosTransfer._sum.monto ?? 0)
  const totalDesembolsos    = Number(desembolsos._sum.montoReal ?? 0)
  const totalAdicional      = Number(adicionales._sum.monto ?? 0)
  const totalRetiro         = Number(retiros._sum.monto ?? 0)
  const neto = totalCortes + totalAdicional - totalDesembolsos - totalRetiro

  return {
    branchIds,
    branchNombres: branches.map((b) => b.nombre),
    desde, hasta,
    totalCortes, totalTransferencia,
    totalDesembolsos, totalAdicional, totalRetiro,
    neto,
  }
}
