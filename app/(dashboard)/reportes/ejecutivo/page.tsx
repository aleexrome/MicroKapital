export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/session'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getReporteEjecutivoSemanal } from '@/lib/reportes/ejecutivo'
import { ReporteEjecutivoView } from '@/components/reportes/ReporteEjecutivoView'

// Reporte privado — solo visible para el Director de Sistemas.
const EMAIL_AUTORIZADO = 'alejandro.romero@microkapital.com'

export default async function ReporteEjecutivoPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  if (session.user.email !== EMAIL_AUTORIZADO && session.user.rol !== 'SUPER_ADMIN') {
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
