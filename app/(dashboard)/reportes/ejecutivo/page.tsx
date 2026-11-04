export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/session'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getReporteEjecutivoSemanal } from '@/lib/reportes/ejecutivo'
import { ReporteEjecutivoView } from '@/components/reportes/ReporteEjecutivoView'

// Reporte ejecutivo — visible para DG, DC, SUPER_ADMIN y el Director
// de Sistemas (email histórico, se queda por retrocompatibilidad).
const EMAIL_AUTORIZADO = 'alejandro.romero@microkapital.com'
const ROLES_AUTORIZADOS = ['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'SUPER_ADMIN']

export default async function ReporteEjecutivoPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  const esEmailAutorizado = session.user.email === EMAIL_AUTORIZADO
  const esRolAutorizado   = ROLES_AUTORIZADOS.includes(session.user.rol)
  if (!esEmailAutorizado && !esRolAutorizado) {
    notFound()
  }

  const [data, empresa] = await Promise.all([
    getReporteEjecutivoSemanal(session.user.companyId!),
    prisma.company.findUnique({
      where:  { id: session.user.companyId! },
      select: { nombre: true },
    }),
  ])

  return (
    <ReporteEjecutivoView
      data={JSON.parse(JSON.stringify(data))}
      empresa={empresa?.nombre ?? 'MicroKapital'}
    />
  )
}
