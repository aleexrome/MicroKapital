import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { companyId } = session.user

  const accounts = await prisma.companyBankAccount.findMany({
    where: { companyId: companyId!, activa: true },
    orderBy: { banco: 'asc' },
  })

  return NextResponse.json({ data: accounts })
}
