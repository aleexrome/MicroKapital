import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { LicenseCheckResult } from '@/types'

export async function GET(req: NextRequest) {
  // Verificar secret interno
  const secret = req.headers.get('x-internal-secret')
  if (secret !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = req.nextUrl.searchParams.get('companyId')
  if (!companyId) {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  }

  const license = await prisma.license.findUnique({
    where: { companyId },
  })

  if (!license) {
    const result: LicenseCheckResult = { allowed: false, status: 'CANCELLED', isGrace: false }
    return NextResponse.json(result)
  }

  // Actualizar última verificación
  prisma.license.update({
    where: { id: license.id },
    data: { ultimaVerificacion: new Date() },
  }).catch(() => {})

  const result: LicenseCheckResult = {
    allowed: license.estado === 'ACTIVE' || license.estado === 'GRACE',
    status: license.estado,
    isGrace: license.estado === 'GRACE',
  }

  return NextResponse.json(result)
}
