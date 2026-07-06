export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getLimboData } from '@/lib/limbo-dashboard'
import { CobradorasBloqueadasWidget } from '@/components/dashboard/CobradorasBloqueadasWidget'
import { Lock } from 'lucide-react'

const ROLES_PERMITIDOS = ['MESA_CONTROL', 'DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'SUPER_ADMIN', 'GERENTE_ZONAL']

export default async function CoordinadoresBloqueadosPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  if (!ROLES_PERMITIDOS.includes(session.user.rol)) redirect('/dashboard')

  const { companyId } = session.user
  const { cobradorasBloqueadas } = await getLimboData(prisma, companyId!)

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Lock className="h-6 w-6 text-primary-700" />
          Coordinadores bloqueados
        </h1>
        <p className="text-muted-foreground">
          Coordinadores con al menos un préstamo en limbo por más de 72 horas. Mientras
          tengan un crédito estancado no pueden crear solicitudes nuevas ni renovaciones.
        </p>
      </div>

      <CobradorasBloqueadasWidget cobradoras={cobradorasBloqueadas} />
    </div>
  )
}
