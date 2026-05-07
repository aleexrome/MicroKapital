import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const companyConfigSchema = z.object({
  representanteLegal: z.string().min(2, 'Representante legal requerido'),
  cat: z.number().min(0).max(999.99),
  interesMoratorio: z.number().min(0).max(999.99),
})

function isAuthorized(rol: string): boolean {
  return rol === 'SUPER_ADMIN' || rol === 'DIRECTOR_GENERAL'
}

export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!isAuthorized(session.user.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { companyId } = session.user
  if (!companyId) return NextResponse.json({ error: 'Empresa requerida' }, { status: 400 })

  const config = await prisma.companyContractConfig.findUnique({
    where: { companyId },
  })

  return NextResponse.json({ data: config })
}

export async function PUT(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!isAuthorized(session.user.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { companyId } = session.user
  if (!companyId) return NextResponse.json({ error: 'Empresa requerida' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const parsed = companyConfigSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const data = parsed.data

  const config = await prisma.companyContractConfig.upsert({
    where: { companyId },
    create: {
      companyId,
      representanteLegal: data.representanteLegal,
      cat: data.cat,
      interesMoratorio: data.interesMoratorio,
    },
    update: {
      representanteLegal: data.representanteLegal,
      cat: data.cat,
      interesMoratorio: data.interesMoratorio,
    },
  })

  return NextResponse.json({ data: config })
}
