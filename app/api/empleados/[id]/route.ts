import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { createAuditLog } from '@/lib/audit'

const ROLES_RH = new Set(['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL'])

const updateSchema = z.object({
  nombre:             z.string().min(2).optional(),
  sucursal:           z.string().optional().nullable(),
  estatus:            z.enum(['ACTIVO', 'BAJA']).optional(),
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
  fechaEntrada:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  fechaBaja:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
})

function parseDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  return new Date(value + 'T06:00:00.000Z')
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, id: userId } = session.user
  if (!ROLES_RH.has(rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const existing = await prisma.employeeRecord.findFirst({
    where: { id: params.id, companyId: companyId! },
  })
  if (!existing) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const d = parsed.data

  // Solo enviamos a Prisma los campos que llegaron en el body (undefined se omite).
  const update: Record<string, unknown> = {}
  if (d.nombre             !== undefined) update.nombre             = d.nombre.trim().toUpperCase()
  if (d.sucursal           !== undefined) update.sucursal           = d.sucursal           || null
  if (d.estatus            !== undefined) update.estatus            = d.estatus
  if (d.nacionalidad       !== undefined) update.nacionalidad       = d.nacionalidad       || null
  if (d.edad               !== undefined) update.edad               = d.edad ?? null
  if (d.identificacion     !== undefined) update.identificacion     = d.identificacion     || null
  if (d.estadoCivil        !== undefined) update.estadoCivil        = d.estadoCivil        || null
  if (d.domicilio          !== undefined) update.domicilio          = d.domicilio          || null
  if (d.sueldo             !== undefined) update.sueldo             = d.sueldo ?? null
  if (d.base               !== undefined) update.base               = d.base               || null
  if (d.puesto             !== undefined) update.puesto             = d.puesto             || null
  if (d.profesion          !== undefined) update.profesion          = d.profesion          || null
  if (d.telefono           !== undefined) update.telefono           = d.telefono           || null
  if (d.contactoEmergencia !== undefined) update.contactoEmergencia = d.contactoEmergencia || null
  if (d.parentesco         !== undefined) update.parentesco         = d.parentesco         || null
  if (d.telefono2          !== undefined) update.telefono2          = d.telefono2          || null
  const fe = parseDate(d.fechaEntrada); if (fe !== undefined) update.fechaEntrada = fe
  const fb = parseDate(d.fechaBaja);    if (fb !== undefined) update.fechaBaja    = fb

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No hay cambios que aplicar' }, { status: 400 })
  }

  const updated = await prisma.employeeRecord.update({
    where: { id: params.id },
    data: update,
  })

  createAuditLog({
    userId,
    accion: 'UPDATE',
    tabla: 'EmployeeRecord',
    registroId: params.id,
    valoresAnteriores: { ...existing },
    valoresNuevos: update,
    ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
  })

  return NextResponse.json({ data: updated })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, id: userId } = session.user
  if (!ROLES_RH.has(rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const existing = await prisma.employeeRecord.findFirst({
    where: { id: params.id, companyId: companyId! },
  })
  if (!existing) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 })

  await prisma.employeeRecord.delete({ where: { id: params.id } })

  createAuditLog({
    userId,
    accion: 'DELETE',
    tabla: 'EmployeeRecord',
    registroId: params.id,
    valoresAnteriores: { nombre: existing.nombre, sucursal: existing.sucursal, puesto: existing.puesto },
    ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
  })

  return NextResponse.json({ ok: true })
}
