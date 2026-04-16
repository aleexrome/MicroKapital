import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { findAvalMatches, getAvalRiskLevel } from '@/lib/aval-check'

/**
 * GET /api/aval-check?nombre=...&telefono=...
 * Checks if a person (by name/phone) appears as aval (guarantor) on any active loan.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { companyId } = session.user
  if (!companyId) {
    return NextResponse.json({ error: 'Empresa no configurada' }, { status: 400 })
  }

  const nombre = req.nextUrl.searchParams.get('nombre')
  const telefono = req.nextUrl.searchParams.get('telefono')

  if (!nombre || nombre.trim().length < 2) {
    return NextResponse.json({ error: 'Nombre requerido (mín. 2 caracteres)' }, { status: 400 })
  }

  const matches = await findAvalMatches(nombre, telefono, companyId)
  const riskLevel = getAvalRiskLevel(matches)

  return NextResponse.json({
    data: {
      matches,
      riskLevel,
      hasMatches: matches.length > 0,
    },
  })
}
