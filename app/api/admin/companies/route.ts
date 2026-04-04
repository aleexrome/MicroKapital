import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const createCompanySchema = z.object({
  nombre: z.string().min(2),
  email: z.string().email().optional(),
  telefono: z.string().optional(),
  direccion: z.string().optional(),
  // Licencia
  claveLicencia: z.string().min(5),
  precioMensual: z.number().positive(),
  diaCobro: z.number().int().min(1).max(28),
  // Sucursal inicial
  branchNombre: z.string().min(2),
  // Usuario gerente
  gerenteNombre: z.string().min(2),
  gerenteEmail: z.string().email(),
  gerentePassword: z.string().min(8),
})

export async function GET() {
  const session = await auth()
  if (!session?.user || session.user.rol !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const companies = await prisma.company.findMany({
    where: { nombre: { not: '__SYSTEM__' } },
    include: {
      license: true,
      _count: { select: { users: true, clients: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ data: companies })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.rol !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = createCompanySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const data = parsed.data
  const bcrypt = await import('bcryptjs')

  const result = await prisma.$transaction(async (tx) => {
    // 1. Crear empresa
    const company = await tx.company.create({
      data: {
        nombre: data.nombre,
        email: data.email,
        telefono: data.telefono,
        direccion: data.direccion,
        activa: true,
      },
    })

    // 2. Crear licencia
    const { addDays } = await import('date-fns')
    await tx.license.create({
      data: {
        companyId: company.id,
        claveLicencia: data.claveLicencia,
        estado: 'ACTIVE',
        precioMensual: data.precioMensual,
        diaCobro: data.diaCobro,
        proximoPago: addDays(new Date(), 30),
      },
    })

    // 3. Crear sucursal inicial
    const branch = await tx.branch.create({
      data: {
        companyId: company.id,
        nombre: data.branchNombre,
        activa: true,
      },
    })

    // 4. Crear usuario gerente
    const gerente = await tx.user.create({
      data: {
        companyId: company.id,
        branchId: null,
        rol: 'GERENTE',
        nombre: data.gerenteNombre,
        email: data.gerenteEmail,
        passwordHash: await bcrypt.hash(data.gerentePassword, 12),
        activo: true,
      },
    })

    // 5. Configuraciones por defecto
    await tx.companySetting.createMany({
      data: [
        { companyId: company.id, clave: 'tasa_solidario', valor: '0.40', descripcion: 'Tasa solidario' },
        { companyId: company.id, clave: 'tasa_individual', valor: '0.30', descripcion: 'Tasa individual' },
      ],
    })

    return { company, branch, gerente }
  })

  return NextResponse.json({ data: result }, { status: 201 })
}
