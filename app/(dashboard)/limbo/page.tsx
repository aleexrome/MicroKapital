export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getLimboData } from '@/lib/limbo-dashboard'
import { PrestamosEnLimboWidget } from '@/components/dashboard/PrestamosEnLimboWidget'
import { Clock } from 'lucide-react'

const ROLES_PERMITIDOS = ['MESA_CONTROL', 'DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'SUPER_ADMIN', 'GERENTE_ZONAL']

export default async function LimboPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  if (!ROLES_PERMITIDOS.includes(session.user.rol)) redirect('/dashboard')

  const { companyId } = session.user
  const { buckets, detalle } = await getLimboData(prisma, companyId!)

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Clock className="h-6 w-6 text-primary-700" />
          Préstamos en limbo
        </h1>
        <p className="text-muted-foreground">
          Créditos aprobados esperando activación, agrupados por antigüedad desde la aprobación.
          Los que llevan más de 72 horas cuentan como críticos y bloquean a la cobradora para
          crear nuevas solicitudes.
        </p>
      </div>

      <PrestamosEnLimboWidget buckets={buckets} detalle={detalle} />
    </div>
  )
}
