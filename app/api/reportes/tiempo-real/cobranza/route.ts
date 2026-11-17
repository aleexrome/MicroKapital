import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getCobranzaTiempoReal } from '@/lib/reportes/tiempoReal'

/**
 * GET /api/reportes/tiempo-real/cobranza
 *
 * Devuelve los snapshots horarios del día (feed del dashboard de
 * tiempo real). El cliente lo polea cada 2 min para auto-refrescar.
 */
export async function GET(_req: NextRequest) {
  const session = await getSession()
  if (!session?.user?.companyId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  // Roles con visibilidad: dirección y mesa de control.
  const rol = session.user.rol
  const permitidos = ['SUPER_ADMIN', 'DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'MESA_CONTROL', 'GERENTE_ZONAL']
  if (!permitidos.includes(rol)) return NextResponse.json({ error: 'Rol sin acceso' }, { status: 403 })

  const data = await getCobranzaTiempoReal(session.user.companyId)
  return NextResponse.json(data)
}
