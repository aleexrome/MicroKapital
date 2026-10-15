import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { cortePendienteDe } from '@/lib/cortes'

/**
 * GET /api/cortes/pendiente
 *
 * Devuelve el id del Corte PENDIENTE más viejo del usuario (si existe)
 * que lo debería tener bloqueado. Lo usa el DashboardLayout para
 * redirigir a la pantalla congelada.
 */
export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ pendiente: null })

  const pendiente = await cortePendienteDe(prisma, {
    id:  session.user.id,
    rol: session.user.rol,
  })
  if (!pendiente) return NextResponse.json({ pendiente: null })

  return NextResponse.json({ pendiente: { corteId: pendiente.id } })
}
