import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const DIAS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'] as const

const branchConfigSchema = z.object({
  codigoSucursal: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, 'Código requerido')
    .max(10, 'Código demasiado largo')
    .regex(/^[A-Z0-9]+$/, 'Solo letras y números'),
  ciudad: z.string().trim().min(2, 'Ciudad requerida'),
  diaCobro: z.enum(DIAS, { errorMap: () => ({ message: 'Día inválido' }) }),
  horaLimiteCobro: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Formato HH:MM (24h)'),
})

function isAuthorized(rol: string): boolean {
  return rol === 'SUPER_ADMIN' || rol === 'DIRECTOR_GENERAL'
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { branchId: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!isAuthorized(session.user.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { companyId } = session.user
  if (!companyId) return NextResponse.json({ error: 'Empresa requerida' }, { status: 400 })

  // Verifica que la sucursal pertenezca a la empresa del usuario.
  const branch = await prisma.branch.findFirst({
    where: { id: params.branchId, companyId },
    select: { id: true },
  })
  if (!branch) {
    return NextResponse.json({ error: 'Sucursal no encontrada' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = branchConfigSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const data = parsed.data

  // Verifica que el codigoSucursal no esté ocupado por otra sucursal.
  const existingCode = await prisma.branchContractConfig.findUnique({
    where: { codigoSucursal: data.codigoSucursal },
    select: { branchId: true },
  })
  if (existingCode && existingCode.branchId !== params.branchId) {
    return NextResponse.json(
      { error: `El código "${data.codigoSucursal}" ya lo usa otra sucursal` },
      { status: 409 }
    )
  }

  const config = await prisma.branchContractConfig.upsert({
    where: { branchId: params.branchId },
    create: {
      branchId: params.branchId,
      codigoSucursal: data.codigoSucursal,
      ciudad: data.ciudad,
      diaCobro: data.diaCobro,
      horaLimiteCobro: data.horaLimiteCobro,
    },
    update: {
      codigoSucursal: data.codigoSucursal,
      ciudad: data.ciudad,
      diaCobro: data.diaCobro,
      horaLimiteCobro: data.horaLimiteCobro,
    },
  })

  return NextResponse.json({ data: config })
}
