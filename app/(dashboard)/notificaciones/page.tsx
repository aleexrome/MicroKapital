import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { NotificacionesClient } from './NotificacionesClient'

export const dynamic = 'force-dynamic'

export default async function NotificacionesPage() {
  const session = await getSession()
  if (!session?.user) {
    redirect('/login')
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-3xl">
      <h1 className="text-2xl font-bold mb-1">Notificaciones</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Alertas del sistema y recordatorios. Las críticas no se pueden marcar como leídas — se mantienen hasta que la condición se resuelva.
      </p>
      <NotificacionesClient />
    </div>
  )
}
