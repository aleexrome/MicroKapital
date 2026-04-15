import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { scopedClientWhere } from '@/lib/access'
import { z } from 'zod'
import { createAuditLog } from '@/lib/audit'

const createClientSchema = z.object({
  nombreCompleto: z.string().min(2, 'Nombre requerido'),
  telefono: z.string().optional(),
  telefonoAlt: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  domicilio: z.string().optional(),
  numIne: z.string().optional(),
  curp: z.string().optional(),
  referenciaNombre: z.string().optional(),
  referenciaTelefono: z.string().optional(),
  fechaNacimiento: z.string().optional(),
  cobradorId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
})

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { companyId } = session.user

  const q = req.nextUrl.searchParams.get('q')

  // Alcance por rol/sucursal — fail-closed si el rol requiere sucursal pero
  // no tiene ninguna asignada (evita que la GERENTE de Tenancingo vea los
  // 416 clientes cuando el JWT queda sin branchId/zonaBranchIds).
  const where: Prisma.ClientWhereInput = {
    companyId: companyId!,
    activo: true,
    AND: [scopedClientWhere(session.user)],
    ...(q ? { nombreCompleto: { contains: q, mode: 'insensitive' } } : {}),
  }

  const clients = await prisma.client.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      nombreCompleto: true,
      telefono: true,
      score: true,
      activo: true,
      cobrador: { select: { nombre: true } },
    },
  })

  return NextResponse.json({ data: clients })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { rol, companyId, branchId, id: userId } = session.user

  const body = await req.json()
  const parsed = createClientSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const data = parsed.data

  // Normalizar nombres a MAYÚSCULAS + trim. Los clientes antiguos estaban todos
  // en mayúsculas; cobradoras/gerentes empezaron a capturar en minúsculas y la
  // cartera se veía inconsistente. Normalizar al guardar garantiza que no
  // importa cómo escriban en el formulario, siempre queda en MAYÚSCULAS.
  const nombreCompleto = data.nombreCompleto.trim().toUpperCase()
  const referenciaNombre = data.referenciaNombre?.trim().toUpperCase() || null

  // Determinar sucursal — Director puede elegir cualquiera; el resto usa la propia
  const { zonaBranchIds } = session.user
  const targetBranchId = data.branchId ?? branchId ?? zonaBranchIds?.[0]
  if (!targetBranchId) {
    return NextResponse.json({ error: 'Sucursal requerida' }, { status: 400 })
  }

  // Verificar que la sucursal pertenezca a la empresa
  const branch = await prisma.branch.findFirst({
    where: { id: targetBranchId, companyId: companyId! },
  })
  if (!branch) {
    return NextResponse.json({ error: 'Sucursal no válida' }, { status: 400 })
  }

  // Coordinador, Cobrador, Gerente y Gerente Zonal: se asignan a sí mismos como cobrador
  // Solo Director puede asignar a otro cobrador (debe enviarlo en el body)
  const isRolCampo = rol === 'COBRADOR' || rol === 'COORDINADOR' || rol === 'GERENTE_ZONAL' || rol === 'GERENTE'
  let cobradorId = data.cobradorId
  if (isRolCampo) {
    cobradorId = userId
  }

  const client = await prisma.client.create({
    data: {
      companyId: companyId!,
      branchId: targetBranchId,
      cobradorId: cobradorId ?? null,
      nombreCompleto,
      telefono: data.telefono || null,
      telefonoAlt: data.telefonoAlt || null,
      email: data.email || null,
      domicilio: data.domicilio || null,
      numIne: data.numIne || null,
      curp: data.curp || null,
      referenciaNombre,
      referenciaTelefono: data.referenciaTelefono || null,
      fechaNacimiento: data.fechaNacimiento ? new Date(data.fechaNacimiento) : null,
      score: 500,
      activo: true,
    },
  })

  createAuditLog({
    userId,
    accion: 'CREATE',
    tabla: 'Client',
    registroId: client.id,
    valoresNuevos: { nombreCompleto, companyId },
    ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
  })

  return NextResponse.json({ data: client }, { status: 201 })
}
