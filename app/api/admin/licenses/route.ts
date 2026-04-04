import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.rol !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const companyId = req.nextUrl.searchParams.get('companyId')

  const licenses = await prisma.license.findMany({
    where: companyId ? { companyId } : undefined,
    include: { company: { select: { nombre: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ data: licenses })
}
