import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { AprobacionesContent } from './AprobacionesContent'

export default async function AprobacionesPage() {
  const session = await getSession()

  if (!session?.user) redirect('/login')

  const { rol } = session.user

  // Solo el Director General y Super Admin pueden acceder a la bandeja de aprobaciones
  if (rol !== 'DIRECTOR_GENERAL' && rol !== 'SUPER_ADMIN') {
    redirect('/prestamos')
  }

  return <AprobacionesContent />
}
