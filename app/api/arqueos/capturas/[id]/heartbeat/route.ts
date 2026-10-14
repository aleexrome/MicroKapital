import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/arqueos/capturas/[id]/heartbeat
 *
 * La pantalla congelada del arqueo postea aquí cada ~15 segundos
 * mientras el user la tiene abierta. Es idempotente y barato (solo
 * actualiza una columna timestamp). En la UI admin se usa para marcar
 * "en línea" vs "visto hace X" vs "no ha abierto".
 *
 * El session.user.id DEBE coincidir con la captura — para que un user
 * no pueda beatear la captura de otro. Si no hay match, 403.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // updateMany para no reventar si la captura ya fue completada/cancelada
  // o si el id no corresponde a este user: simplemente no actualiza nada.
  const r = await prisma.arqueoCaptura.updateMany({
    where: {
      id:          params.id,
      userId:      session.user.id,
      capturadoAt: null,
      canceladoAt: null,
      arqueo:      { canceladoAt: null },
    },
    data: { ultimoVistoAt: new Date() },
  })

  return NextResponse.json({ ok: true, updated: r.count })
}
