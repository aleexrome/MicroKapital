import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { createAuditLog } from '@/lib/audit'

/**
 * Recursos Humanos — registro administrativo de empleados.
 *
 * Acceso: solo DIRECTOR_GENERAL y DIRECTOR_COMERCIAL. Es una página
 * independiente del modelo User; no comparte permisos con el resto de
 * la app.
 */

const ROLES_RH = new Set(['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL'])

const createSchema = z.object({
  nombre:             z.string().min(2, 'Nombre requerido').transform((s) => s.trim().toUpperCase()),
  sucursal:           z.string().optional().nullable(),
  estatus:            z.enum(['ACTIVO', 'BAJA']).default('ACTIVO'),
  nacionalidad:       z.string().optional().nullable(),
  edad:               z.number().int().min(0).max(120).optional().nullable(),
  identificacion:     z.string().optional().nullable(),
  estadoCivil:        z.string().optional().nullable(),
  domicilio:          z.string().optional().nullable(),
  sueldo:             z.number().nonnegative().optional().nullable(),
  base:               z.string().optional().nullable(),
  puesto:             z.string().optional().nullable(),
  profesion:          z.string().optional().nullable(),
  telefono:           z.string().optional().nullable(),
  contactoEmergencia: z.string().optional().nullable(),
  parentesco:         z.string().optional().nullable(),
  telefono2:          z.string().optional().nullable(),
  fechaEntrada:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD').optional().nullable(),
  fechaBaja:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD').optional().nullable(),
})

export async function GET(_req: NextRequest) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!ROLES_RH.has(session.user.rol)) {
    return NextResponse.json({ error: 'Sin permisos — Recursos Humanos es solo para Dirección' }, { status: 403 })
  }

  const empleados = await prisma.employeeRecord.findMany({
    where: { companyId: session.user.companyId! },
    orderBy: [{ estatus: 'asc' }, { nombre: 'asc' }],
  })

  return NextResponse.json({ data: empleados })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, id: userId } = session.user
  if (!ROLES_RH.has(rol)) {
    return NextResponse.json({ error: 'Sin permisos — Recursos Humanos es solo para Dirección' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const d = parsed.data

  const empleado = await prisma.employeeRecord.create({
    data: {
      companyId:          companyId!,
      nombre:             d.nombre,
      sucursal:           d.sucursal           || null,
      estatus:            d.estatus,
      nacionalidad:       d.nacionalidad       || null,
      edad:               d.edad ?? null,
      identificacion:     d.identificacion     || null,
      estadoCivil:        d.estadoCivil        || null,
      domicilio:          d.domicilio          || null,
      sueldo:             d.sueldo ?? null,
      base:               d.base               || null,
      puesto:             d.puesto             || null,
      profesion:          d.profesion          || null,
      telefono:           d.telefono           || null,
      contactoEmergencia: d.contactoEmergencia || null,
      parentesco:         d.parentesco         || null,
      telefono2:          d.telefono2          || null,
      fechaEntrada:       d.fechaEntrada       ? new Date(d.fechaEntrada + 'T06:00:00.000Z') : null,
      fechaBaja:          d.fechaBaja          ? new Date(d.fechaBaja    + 'T06:00:00.000Z') : null,
    },
  })

  createAuditLog({
    userId,
    accion: 'CREATE',
    tabla: 'EmployeeRecord',
    registroId: empleado.id,
    valoresNuevos: { nombre: empleado.nombre, sucursal: empleado.sucursal, puesto: empleado.puesto },
    ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
  })

  return NextResponse.json({ data: empleado }, { status: 201 })
}
