import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/my-branch-config
 *
 * Devuelve la config publica de la sucursal del usuario (o la primera
 * de su zona si es GERENTE_ZONAL). Usa la UI del formulario de nuevo
 * prestamo para calcular la preview con el override de sucursal, ej.
 * Veracruz aplica comision 10% permanente en renovaciones.
 *
 * Solo campos que la UI necesita — no expone folios ni otros datos
 * internos.
 */
export async function GET(_req: NextRequest) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { branchId, zonaBranchIds } = session.user
  const targetBranchId = branchId
    ?? (Array.isArray(zonaBranchIds) && zonaBranchIds.length > 0 ? zonaBranchIds[0] : null)

  if (!targetBranchId) {
    return NextResponse.json({ data: null })
  }

  const config = await prisma.branchContractConfig.findUnique({
    where: { branchId: targetBranchId },
    select: {
      diaCobro: true,
      horaLimiteCobro: true,
      comisionRenovacionFija: true,
    },
  })

  return NextResponse.json({
    data: config
      ? {
          diaCobro: config.diaCobro,
          horaLimiteCobro: config.horaLimiteCobro,
          comisionRenovacionFija: config.comisionRenovacionFija
            ? Number(config.comisionRenovacionFija)
            : null,
        }
      : null,
  })
}
