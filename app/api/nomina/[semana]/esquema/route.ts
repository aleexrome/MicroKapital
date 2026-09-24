import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { idToSaturday } from '@/lib/week-utils'
import { z } from 'zod'

// Solo estos roles pueden cambiar el esquema de nomina de otro usuario.
// El coord no puede auto-cambiarse su esquema (obvio — sería regalo
// para el coord elegir cuál le paga más).
const ROLES_CAN_TOGGLE = new Set(['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'SUPER_ADMIN'])

const bodySchema = z.object({
  userId:  z.string().uuid(),
  esquema: z.enum(['COLOCACION', 'COBRANZA']),
})

/**
 * POST /api/nomina/[semana]/esquema
 *
 * Marca (o cambia) el esquema con el que se paga la nomina de un
 * usuario para UNA semana especifica. Idempotente — si ya existe una
 * fila para (userId, semanaSabado) se hace UPDATE, si no INSERT.
 *
 * Body: { userId, esquema: 'COLOCACION' | 'COBRANZA' }
 * Permisos: DG / DC / SUPER_ADMIN unicamente.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { semana: string } },
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { rol, companyId, id: actorId } = session.user

  if (!ROLES_CAN_TOGGLE.has(rol)) {
    return NextResponse.json({ error: 'Sin permisos para cambiar esquema de nómina' }, { status: 403 })
  }

  // Parsear semana
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.semana)) {
    return NextResponse.json({ error: 'Semana inválida' }, { status: 400 })
  }
  const saturday = idToSaturday(params.semana)
  if (isNaN(saturday.getTime())) {
    return NextResponse.json({ error: 'Semana inválida' }, { status: 400 })
  }

  // Body
  const json = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Body inválido' }, { status: 400 })
  }
  const { userId, esquema } = parsed.data

  // Verificar que el usuario objetivo pertenece a la misma company.
  const target = await prisma.user.findFirst({
    where: { id: userId, companyId: companyId! },
    select: { id: true, nombre: true },
  })
  if (!target) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

  // Upsert
  const override = await prisma.nominaEsquemaOverride.upsert({
    where: { userId_semanaSabado: { userId, semanaSabado: saturday } },
    update: { esquema, createdBy: actorId },
    create: { companyId: companyId!, userId, semanaSabado: saturday, esquema, createdBy: actorId },
  })

  createAuditLog({
    userId: actorId,
    accion: 'NOMINA_ESQUEMA_CAMBIADO',
    tabla: 'NominaEsquemaOverride',
    registroId: override.id,
    valoresNuevos: {
      usuarioAfectado: userId,
      usuarioAfectadoNombre: target.nombre,
      semana: params.semana,
      esquema,
    },
  })

  return NextResponse.json({ ok: true, esquema, semana: params.semana })
}
