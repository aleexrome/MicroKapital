import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { arqueoPendienteDe } from '@/lib/arqueos'

/**
 * GET /api/arqueos/pendiente
 *
 * Devuelve si el usuario de la sesión tiene un arqueo PENDIENTE que
 * esté bloqueando su pantalla. Lo usa el middleware/layout wrapper
 * para redirigir a /arqueo/pendiente/[capturaId] antes de renderizar
 * cualquier otra ruta.
 */
export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ pendiente: null })

  const pendiente = await arqueoPendienteDe(prisma, session.user.id)
  if (!pendiente) return NextResponse.json({ pendiente: null })

  return NextResponse.json({
    pendiente: {
      capturaId: pendiente.id,
      arqueoId:  pendiente.arqueoId,
    },
  })
}
