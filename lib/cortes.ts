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
import { todayMx } from '@/lib/timezone'

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

  // Buscar el corte PROPIO más viejo que no esté ACEPTADO (PARCIAL o CONSOLIDADO).
  const row = await prisma.corte.findFirst({
    where: {
      userId: user.id,
      estado: { in: ['ABIERTO', 'ENTREGADO', 'RECHAZADO'] },
      OR: hoyBloquea
        ? [{ fecha: { lte: hoy } }]
        : [{ fecha: { lt: hoy } }],
    },
    orderBy: { fecha: 'asc' },
    select:  { id: true },
  })
  if (row) return { id: row.id, tipo: 'PROPIO' }

  // Bloqueo adicional (rework): concentradora con parciales ACEPTADOS
  // recibidos de ayer o antes que NO están en un consolidado ACEPTADO.
  // Significa que "hay dinero colgando" sin entregar a DG/DC.
  // IMPORTANTE: el id devuelto es el del parcial ACEPTADO — la UI congelada
  // NO debe mandarlo a /corte/pendiente/[id] (haría loop porque ACEPTADO
  // redirige a /dashboard que vuelve a bloquear). La layout detecta el
  // tipo COLGANDO_CONSOLIDAR y manda a /corte-del-dia donde la
  // concentradora crea el consolidado.
  const parcialColgando = await prisma.corte.findFirst({
    where: {
      receptorId: user.id,
      tipo:       'PARCIAL',
      estado:     'ACEPTADO',
      fecha:      { lt: hoy },
      OR: [
        { consolidadoPadreId: null },
        {
          consolidadoPadre: {
            estado: { in: ['ABIERTO', 'ENTREGADO', 'RECHAZADO'] },
          },
        },
      ],
    },
    orderBy: { fecha: 'asc' },
    select:  { id: true },
  })
  if (parcialColgando) {
    return { id: parcialColgando.id, tipo: 'COLGANDO_CONSOLIDAR' }
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
  const rows = await prisma.corte.findMany({
    where: {
      receptorId:         concentradoraId,
      fecha,
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
