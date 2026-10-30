import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { desgloseCorte } from '@/lib/cortes'

/**
 * GET /api/cortes/[id]/desglose
 *
 * Auditoría de "de dónde salen las cifras" de un corte:
 *   - pagos de cuotas (cliente, # pago, monto, método, hora)
 *   - seguros / comisiones de apertura
 *   - multas / moras cobradas
 *   - transferencias no verificadas en la ventana
 *
 * Permisos: DG, DC, SA, MC. Cualquier otro rol → 403.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const rolesPermitidos = ['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'SUPER_ADMIN', 'MESA_CONTROL']
  if (!rolesPermitidos.includes(session.user.rol)) {
    return NextResponse.json({ error: 'Solo DG, DC, SA y MC pueden auditar cortes' }, { status: 403 })
  }

  // Mesa de Control queda limitada a su propia empresa (no puede ver otras compañías).
  const corte = await prisma.corte.findUnique({
    where:  { id: params.id },
    select: { id: true, companyId: true },
  })
  if (!corte) return NextResponse.json({ error: 'Corte no encontrado' }, { status: 404 })
  if (corte.companyId !== session.user.companyId) {
    return NextResponse.json({ error: 'Corte fuera de tu empresa' }, { status: 403 })
  }

  const desglose = await desgloseCorte(prisma, params.id)
  if (!desglose) return NextResponse.json({ error: 'Corte no encontrado' }, { status: 404 })

  return NextResponse.json(desglose)
}
