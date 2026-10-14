/**
 * Helpers de dominio para los arqueos sorpresivos.
 *
 * Roles:
 *   - Lanzan arqueos: DG, DC, SUPER_ADMIN (DS = Alejandro = DG con etiqueta,
 *     ya cubierto).
 *   - Reciben arqueos: TODOS los demás roles activos (MESA_CONTROL,
 *     GERENTE_ZONAL, GERENTE, COORDINADOR, COBRADOR). DG/DC/SA NO reciben
 *     — ellos solo visualizan.
 */

import type { PrismaClient, UserRole } from '@prisma/client'
import { getSaturday, getFriday } from '@/lib/week-utils'

/** Roles habilitados a lanzar / cancelar / ver arqueos. */
export const ROLES_LANZAN_ARQUEO: readonly UserRole[] = [
  'SUPER_ADMIN',
  'DIRECTOR_GENERAL',
  'DIRECTOR_COMERCIAL',
] as const

/** Roles que SÍ reciben arqueo cuando están en scope. */
export const ROLES_RECIBEN_ARQUEO: readonly UserRole[] = [
  'MESA_CONTROL',
  'GERENTE_ZONAL',
  'GERENTE',
  'COORDINADOR',
  'COBRADOR',
] as const

export function puedeLanzarArqueo(rol: string): boolean {
  return (ROLES_LANZAN_ARQUEO as readonly string[]).includes(rol)
}

export function recibeArqueo(rol: string): boolean {
  return (ROLES_RECIBEN_ARQUEO as readonly string[]).includes(rol)
}

/**
 * Denominaciones MXN (billetes + monedas) — unidades en pesos.
 * 0.5 = 50 centavos, 1 = $1, ..., 1000 = $1000. Ordenadas de mayor a menor
 * para que el formulario arranque desde la denominación grande.
 */
export const DENOMINACIONES_MXN: readonly number[] = [
  1000, 500, 200, 100, 50, 20,  // billetes
  20, 10, 5, 2, 1, 0.5,          // monedas
]

/**
 * Devuelve la semana MK actual (sábado 00:00 a viernes 23:59:59 MX)
 * calculada contra la fecha dada (default: ahora).
 */
export function semanaMKActual(now: Date = new Date()): { inicio: Date; fin: Date; sabado: Date } {
  const sabado = getSaturday(now)
  // getFriday devuelve el viernes de la SEMANA que empieza ese sábado,
  // ya a las 23:59:59.999.
  const viernes = getFriday(sabado)
  return { inicio: sabado, fin: viernes, sabado }
}

/**
 * Esperado del sistema para un usuario en la semana MK dada:
 *   - efectivo: suma de pagos CASH cobrados por el user (no cancelados).
 *   - transferencias: suma de pagos TRANSFER cobrados por el user (no cancelados).
 *
 * Se usa como snapshot al momento de capturar para la comparativa
 * "Arqueo vs Esperado vs Diferencia".
 */
export async function calcularEsperadoSemana(
  prisma: PrismaClient,
  userId: string,
  companyId: string,
  semana: { inicio: Date; fin: Date },
): Promise<{ efectivo: number; transferencias: number }> {
  const whereBase = {
    cobradorId: userId,
    canceledAt: null,
    loan: { companyId },
    fechaHora: { gte: semana.inicio, lte: semana.fin },
  } as const

  const [cash, transfer] = await Promise.all([
    prisma.payment.aggregate({ where: { ...whereBase, metodoPago: 'CASH'     }, _sum: { monto: true } }),
    prisma.payment.aggregate({ where: { ...whereBase, metodoPago: 'TRANSFER' }, _sum: { monto: true } }),
  ])

  return {
    efectivo:       Number(cash._sum.monto ?? 0),
    transferencias: Number(transfer._sum.monto ?? 0),
  }
}

/**
 * Encuentra la captura PENDIENTE más reciente del usuario (si existe).
 * Se usa en el layout wrapper para redirigir a la pantalla congelada.
 *
 * Pendiente = `capturadoAt IS NULL` AND `canceladoAt IS NULL` AND el
 * Arqueo padre no está cancelado.
 */
export async function arqueoPendienteDe(
  prisma: PrismaClient,
  userId: string,
): Promise<{ id: string; arqueoId: string } | null> {
  const captura = await prisma.arqueoCaptura.findFirst({
    where: {
      userId,
      capturadoAt: null,
      canceladoAt: null,
      arqueo: { canceladoAt: null },
    },
    select: { id: true, arqueoId: true },
    orderBy: { arqueo: { lanzadoAt: 'asc' } }, // el más viejo primero
  })
  return captura
}

/**
 * Devuelve los IDs de usuarios que deberían recibir el arqueo según el
 * tipo y el scope (branchId), excluyendo los que ya tienen un arqueo
 * pendiente (regla: 1 pendiente máximo por user).
 */
export async function resolverTargetUsers(
  prisma: PrismaClient,
  opts: {
    companyId: string
    tipo:      'INDIVIDUAL' | 'BRANCH' | 'GLOBAL'
    targetUserId?: string | null
    branchId?:     string | null
  },
): Promise<{ incluidos: string[]; saltados: { userId: string; motivo: string }[] }> {
  const where: Record<string, unknown> = {
    companyId: opts.companyId,
    activo:    true,
    rol:       { in: [...ROLES_RECIBEN_ARQUEO] },
  }

  if (opts.tipo === 'INDIVIDUAL') {
    if (!opts.targetUserId) {
      return { incluidos: [], saltados: [] }
    }
    where.id = opts.targetUserId
  } else if (opts.tipo === 'BRANCH') {
    if (!opts.branchId) {
      return { incluidos: [], saltados: [] }
    }
    where.branchId = opts.branchId
  }
  // GLOBAL: no agrega filtro — todos los que reciben.

  const users = await prisma.user.findMany({
    where,
    select: { id: true, nombre: true },
  })

  // Filtrar los que ya tienen pendiente.
  const incluidos: string[] = []
  const saltados: { userId: string; motivo: string }[] = []
  for (const u of users) {
    const pendiente = await prisma.arqueoCaptura.count({
      where: {
        userId: u.id,
        capturadoAt: null,
        canceladoAt: null,
        arqueo: { canceladoAt: null },
      },
    })
    if (pendiente > 0) {
      saltados.push({ userId: u.id, motivo: `${u.nombre} ya tiene un arqueo pendiente — se omite` })
    } else {
      incluidos.push(u.id)
    }
  }
  return { incluidos, saltados }
}
