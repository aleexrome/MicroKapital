import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { createAuditLog } from '@/lib/audit'

const updateAvalSchema = z.object({
  avalNombre:   z.string().optional().nullable(),
  avalTelefono: z.string().optional().nullable(),
  avalRelacion: z.string().optional().nullable(),
})

/**
 * PATCH /api/loans/[id]/aval
 *
 * Actualiza unicamente los tres campos del aval (nombre, telefono,
 * relacion). Cualquier rol autenticado puede llamarlo porque este dato
 * alimenta el sistema de recordatorios automaticos por voz: la cobradora
 * en campo a veces captura o corrige el contacto del aval sobre la
 * marcha, sobre todo en creditos viejos / renovados que se quedaron sin
 * aval registrado. Los demas campos del prestamo (capital, plazo, etc.)
 * NO se tocan aqui.
 *
 * Solo aplica a INDIVIDUAL y FIDUCIARIO -- son los productos con aval.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { companyId, id: userId } = session.user

  const loan = await prisma.loan.findFirst({
    where: { id: params.id, companyId: companyId! },
    select: {
      id: true,
      tipo: true,
      avalNombre: true,
      avalTelefono: true,
      avalRelacion: true,
    },
  })
  if (!loan) {
    return NextResponse.json({ error: 'Prestamo no encontrado' }, { status: 404 })
  }
  if (loan.tipo !== 'INDIVIDUAL' && loan.tipo !== 'FIDUCIARIO') {
    return NextResponse.json(
      { error: 'Solo los creditos INDIVIDUAL y FIDUCIARIO tienen aval' },
      { status: 400 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const parsed = updateAvalSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const data = parsed.data

  // Normalizacion: nombres y relacion en MAYUSCULAS + trim; telefono solo trim.
  const update: Record<string, unknown> = {}
  if (data.avalNombre !== undefined) {
    const v = (data.avalNombre ?? '').trim().toUpperCase()
    update.avalNombre = v === '' ? null : v
  }
  if (data.avalTelefono !== undefined) {
    const v = (data.avalTelefono ?? '').trim()
    update.avalTelefono = v === '' ? null : v
  }
  if (data.avalRelacion !== undefined) {
    const v = (data.avalRelacion ?? '').trim().toUpperCase()
    update.avalRelacion = v === '' ? null : v
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No hay cambios que aplicar' }, { status: 400 })
  }

  await prisma.loan.update({
    where: { id: params.id },
    data: update,
  })

  createAuditLog({
    userId,
    accion: 'UPDATE_AVAL',
    tabla: 'Loan',
    registroId: params.id,
    valoresAnteriores: {
      avalNombre:   loan.avalNombre,
      avalTelefono: loan.avalTelefono,
      avalRelacion: loan.avalRelacion,
    },
    valoresNuevos: update,
    ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
  })

  return NextResponse.json({ ok: true })
}
