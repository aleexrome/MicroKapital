import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import {
  puedeLanzarArqueo,
  resolverTargetUsers,
  calcularEsperadoSemana,
  semanaMKActual,
} from '@/lib/arqueos'

const lanzarSchema = z.object({
  tipo:         z.enum(['INDIVIDUAL', 'BRANCH', 'GLOBAL']),
  targetUserId: z.string().uuid().nullable().optional(),
  branchId:     z.string().uuid().nullable().optional(),
})

/**
 * POST /api/arqueos — lanzar un arqueo sorpresivo.
 *
 * Autoriza: DG / DC / SUPER_ADMIN (DS = Alejandro con rol DG).
 *
 * Flujo:
 *   1. Resuelve los usuarios target según el tipo (INDIVIDUAL/BRANCH/GLOBAL),
 *      excluyendo los que ya tengan una captura pendiente (regla "1 por user").
 *   2. Crea el Arqueo + N ArqueoCaptura (una por user target) en una
 *      transacción. Las capturas quedan con capturadoAt = null (pendientes).
 *   3. Devuelve resumen de incluidos / saltados para que el admin vea.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!puedeLanzarArqueo(session.user.rol)) {
    return NextResponse.json({ error: 'Solo DG / DC / SUPER_ADMIN pueden lanzar arqueos' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = lanzarSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }
  const { tipo, targetUserId, branchId } = parsed.data

  if (tipo === 'INDIVIDUAL' && !targetUserId) {
    return NextResponse.json({ error: 'Arqueo INDIVIDUAL requiere targetUserId' }, { status: 400 })
  }
  if (tipo === 'BRANCH' && !branchId) {
    return NextResponse.json({ error: 'Arqueo BRANCH requiere branchId' }, { status: 400 })
  }

  const companyId = session.user.companyId!
  const lanzadoPorId = session.user.id

  const { incluidos, saltados } = await resolverTargetUsers(prisma, {
    companyId,
    tipo,
    targetUserId: targetUserId ?? null,
    branchId:     branchId ?? null,
  })

  if (incluidos.length === 0) {
    const motivo = saltados.length > 0
      ? `Todos los usuarios target ya tienen arqueo pendiente (${saltados.length}).`
      : 'No se encontraron usuarios target para este arqueo.'
    return NextResponse.json({ error: motivo, saltados }, { status: 409 })
  }

  // Creamos arqueo + capturas en una sola transacción. El "esperado"
  // se calcula AL MOMENTO DE CAPTURAR, no al lanzar — así el usuario
  // nunca ve snapshot ni se pueden filtrar datos.
  const arqueo = await prisma.$transaction(async (tx) => {
    const a = await tx.arqueo.create({
      data: {
        companyId,
        tipo,
        branchId: tipo === 'BRANCH' ? branchId! : null,
        lanzadoPorId,
      },
    })
    await tx.arqueoCaptura.createMany({
      data: incluidos.map((userId) => ({
        arqueoId: a.id,
        userId,
      })),
    })
    return a
  })

  createAuditLog({
    userId: lanzadoPorId,
    accion: 'LANZAR_ARQUEO',
    tabla: 'Arqueo',
    registroId: arqueo.id,
    valoresNuevos: { tipo, branchId: branchId ?? null, incluidos: incluidos.length, saltados: saltados.length },
  })

  return NextResponse.json({
    id: arqueo.id,
    tipo,
    incluidos: incluidos.length,
    saltados,
  }, { status: 201 })
}

/**
 * GET /api/arqueos — listar arqueos de la empresa.
 *
 * Query params:
 *   - desde / hasta : ISO date (opcional, filtra lanzadoAt)
 *   - branchId      : filtrar por sucursal (BRANCH o INDIVIDUAL cuyos
 *                     usuarios estén en esa sucursal)
 *
 * Devuelve cada arqueo con sus capturas (user, estado, montos).
 */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!puedeLanzarArqueo(session.user.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const url = req.nextUrl
  const desde = url.searchParams.get('desde')
  const hasta = url.searchParams.get('hasta')
  const branchIdFilter = url.searchParams.get('branchId') || null

  const where: Record<string, unknown> = {
    companyId: session.user.companyId!,
  }
  if (desde || hasta) {
    where.lanzadoAt = {
      ...(desde ? { gte: new Date(desde) } : {}),
      ...(hasta ? { lte: new Date(hasta) } : {}),
    }
  }
  if (branchIdFilter) {
    where.OR = [
      { branchId: branchIdFilter },
      { capturas: { some: { user: { branchId: branchIdFilter } } } },
    ]
  }

  const arqueos = await prisma.arqueo.findMany({
    where,
    orderBy: { lanzadoAt: 'desc' },
    include: {
      lanzadoPor:   { select: { id: true, nombre: true, rol: true, branch: { select: { nombre: true } } } },
      canceladoPor: { select: { id: true, nombre: true } },
      branch:       { select: { id: true, nombre: true } },
      capturas: {
        orderBy: { user: { nombre: 'asc' } },
        include: {
          user: { select: { id: true, nombre: true, rol: true, branch: { select: { id: true, nombre: true } } } },
        },
      },
    },
    take: 200,
  })

  return NextResponse.json({ arqueos })
}
