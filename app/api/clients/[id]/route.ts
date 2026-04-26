import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { createAuditLog } from '@/lib/audit'

/**
 * GET — used by aval-check and other client lookups.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { companyId } = session.user

  const client = await prisma.client.findFirst({
    where: { id: params.id, companyId: companyId! },
    select: {
      id: true,
      nombreCompleto: true,
      telefono: true,
      score: true,
      activo: true,
    },
  })

  if (!client) {
    return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
  }

  return NextResponse.json({ data: client })
}

const updateClientSchema = z.object({
  nombreCompleto:     z.string().min(2, 'Nombre requerido').optional(),
  telefono:           z.string().optional().nullable(),
  telefonoAlt:        z.string().optional().nullable(),
  email:              z.string().email().optional().or(z.literal('')).nullable(),
  domicilio:          z.string().optional().nullable(),
  numIne:             z.string().optional().nullable(),
  curp:               z.string().optional().nullable(),
  referenciaNombre:   z.string().optional().nullable(),
  referenciaTelefono: z.string().optional().nullable(),
  fechaNacimiento:    z.string().optional().nullable(),
  cobradorId:         z.string().uuid().optional().nullable(),
})

/**
 * Edicion de expediente de cliente -- solo DIRECTOR_GENERAL.
 *
 * Stephanie necesita poder corregir errores de captura (p. ej. "|7225634881"
 * o domicilios en minusculas). El resto de roles NO puede editar clientes
 * -- tienen que pedirle a Direccion.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { rol, companyId, id: userId } = session.user

  if (rol !== 'DIRECTOR_GENERAL') {
    return NextResponse.json({ error: 'Solo Direccion General puede editar clientes' }, { status: 403 })
  }

  // Verificar que el cliente exista y sea de su empresa
  const existing = await prisma.client.findFirst({
    where: { id: params.id, companyId: companyId! },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
  }

  const body = await req.json()
  const parsed = updateClientSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const data = parsed.data

  // Si se envia un cobradorId, verificar que pertenezca a la misma empresa
  if (data.cobradorId) {
    const cobrador = await prisma.user.findFirst({
      where: { id: data.cobradorId, companyId: companyId! },
      select: { id: true },
    })
    if (!cobrador) {
      return NextResponse.json({ error: 'Cobrador no valido' }, { status: 400 })
    }
  }

  // Normalizacion -- mismo criterio que POST: nombres en MAYUSCULAS + trim.
  const update: Record<string, unknown> = {}
  if (data.nombreCompleto !== undefined) {
    update.nombreCompleto = data.nombreCompleto.trim().toUpperCase()
  }
  if (data.referenciaNombre !== undefined) {
    update.referenciaNombre = data.referenciaNombre
      ? data.referenciaNombre.trim().toUpperCase()
      : null
  }
  // numIne y curp se normalizan a MAYUSCULAS por convencion del documento
  for (const key of ['numIne', 'curp'] as const) {
    if (data[key] !== undefined) {
      const v = (data[key] ?? '').trim().toUpperCase()
      update[key] = v === '' ? null : v
    }
  }
  // Campos libres: solo trim, sin normalizar caja
  for (const key of ['telefono', 'telefonoAlt', 'email', 'domicilio', 'referenciaTelefono'] as const) {
    if (data[key] !== undefined) {
      const v = (data[key] ?? '').trim()
      update[key] = v === '' ? null : v
    }
  }
  if (data.fechaNacimiento !== undefined) {
    update.fechaNacimiento = data.fechaNacimiento ? new Date(data.fechaNacimiento) : null
  }
  if (data.cobradorId !== undefined) {
    update.cobradorId = data.cobradorId ?? null
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No hay cambios que aplicar' }, { status: 400 })
  }

  const updated = await prisma.client.update({
    where: { id: params.id },
    data: update,
  })

  createAuditLog({
    userId,
    accion: 'UPDATE',
    tabla: 'Client',
    registroId: params.id,
    valoresAnteriores: {
      nombreCompleto:     existing.nombreCompleto,
      telefono:           existing.telefono,
      telefonoAlt:        existing.telefonoAlt,
      email:              existing.email,
      domicilio:          existing.domicilio,
      numIne:             existing.numIne,
      curp:               existing.curp,
      referenciaNombre:   existing.referenciaNombre,
      referenciaTelefono: existing.referenciaTelefono,
      fechaNacimiento:    existing.fechaNacimiento?.toISOString() ?? null,
      cobradorId:         existing.cobradorId,
    },
    valoresNuevos: update,
    ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
  })

  return NextResponse.json({ data: updated })
}

/**
 * DELETE — soft-delete del cliente. Setea `eliminadoEn = now()`. El
 * cliente desaparece de cartera, agenda, rutas, dashboard y de todas las
 * cobranzas presentes (su historial pasado en /rutas/<semana> NO cambia).
 *
 * Reversible: mientras `eliminadoEn` no haya cumplido 14 días, basta
 * con poner el campo en NULL para reactivarlo. Pasados los 14 días el
 * cron `/api/cron/purge-deleted` hace hard delete.
 *
 * Solo DIRECTOR_GENERAL.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { rol, companyId, id: userId } = session.user
  if (rol !== 'DIRECTOR_GENERAL') {
    return NextResponse.json(
      { error: 'Solo Dirección General puede eliminar clientes' },
      { status: 403 },
    )
  }

  const existing = await prisma.client.findFirst({
    where: { id: params.id, companyId: companyId! },
    select: { id: true, nombreCompleto: true, eliminadoEn: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
  }
  if (existing.eliminadoEn) {
    return NextResponse.json({ error: 'El cliente ya estaba eliminado' }, { status: 400 })
  }

  const now = new Date()
  await prisma.client.update({
    where: { id: params.id },
    data: { eliminadoEn: now },
  })

  createAuditLog({
    userId,
    accion: 'DELETE_SOFT',
    tabla: 'Client',
    registroId: params.id,
    valoresAnteriores: { nombreCompleto: existing.nombreCompleto, eliminadoEn: null },
    valoresNuevos: { eliminadoEn: now.toISOString() },
    ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
  })

  return NextResponse.json({
    message: 'Cliente eliminado. Se purgará automáticamente a los 14 días.',
  })
}
