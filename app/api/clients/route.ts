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

  // Normalizar nombres y documentos a MAYÚSCULAS + trim. Los clientes antiguos
  // estaban todos en mayúsculas; cobradoras/gerentes empezaron a capturar en
  // minúsculas y la cartera se veía inconsistente. Normalizar al guardar
  // garantiza consistencia sin importar cómo escriban en el formulario —
  // también defiende si el API se llama desde otro lado (p. ej. script).
  const nombreCompleto = data.nombreCompleto.trim().toUpperCase()
  const referenciaNombre = data.referenciaNombre?.trim().toUpperCase() || null
  const numIne = data.numIne?.trim().toUpperCase() || null
  const curp = data.curp?.trim().toUpperCase() || null

  // Bloquear duplicados a nivel EMPRESA — mismo nombre completo, mismo INE
  // o mismo CURP identifican al mismo cliente, sin importar sucursal o
  // coordinador. Si Jaime intenta dar de alta un cliente que ya tiene
  // Cristina en otra sucursal, aquí lo cachamos y le decimos dónde vive.
  // Ignoramos clientes soft-eliminados (eliminadoEn != null) para permitir
  // re-registrar tras purga o si DG decide reactivar.
  const orClauses: Prisma.ClientWhereInput[] = [
    { nombreCompleto: { equals: nombreCompleto, mode: 'insensitive' } },
  ]
  if (numIne) orClauses.push({ numIne: { equals: numIne, mode: 'insensitive' } })
  if (curp) orClauses.push({ curp: { equals: curp, mode: 'insensitive' } })

  const duplicado = await prisma.client.findFirst({
    where: {
      companyId: companyId!,
      eliminadoEn: null,
      OR: orClauses,
    },
    select: {
      id: true,
      nombreCompleto: true,
      numIne: true,
      curp: true,
      branch: { select: { nombre: true } },
      cobrador: { select: { nombre: true } },
    },
  })
  if (duplicado) {
    const eq = (a: string | null, b: string | null) =>
      !!a && !!b && a.trim().toUpperCase() === b.trim().toUpperCase()
    const motivo =
      eq(duplicado.numIne, numIne) ? 'mismo INE'
      : eq(duplicado.curp, curp) ? 'mismo CURP'
      : 'mismo nombre'
    const sucursal = duplicado.branch?.nombre ?? 'otra sucursal'
    const coord = duplicado.cobrador?.nombre ?? 'sin coordinador asignado'
    return NextResponse.json(
      {
        error: `Ya existe un cliente con ${motivo}: ${duplicado.nombreCompleto} (${sucursal}, coordinador: ${coord}). No se puede registrar dos veces.`,
        duplicate: {
          id: duplicado.id,
          nombreCompleto: duplicado.nombreCompleto,
          motivo,
          branchName: duplicado.branch?.nombre ?? null,
          cobradorName: duplicado.cobrador?.nombre ?? null,
        },
      },
      { status: 409 },
    )
  }

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
      numIne,
      curp,
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
