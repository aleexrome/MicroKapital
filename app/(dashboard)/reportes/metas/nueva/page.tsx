export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { MetaForm } from '@/components/reportes/MetaForm'

const ROLES_DEFINEN = ['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL']

export default async function NuevaMetaPage({
  searchParams,
}: {
  searchParams: { semanaInicio?: string }
}) {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  const { rol, companyId } = session.user
  if (!ROLES_DEFINEN.includes(rol)) redirect('/reportes/metas')

  const [branches, cobradores] = await Promise.all([
    prisma.branch.findMany({
      where: { companyId: companyId!, activa: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),
    prisma.user.findMany({
      where: {
        companyId: companyId!,
        rol: { in: ['COBRADOR', 'COORDINADOR', 'GERENTE', 'GERENTE_ZONAL'] },
        activo: true,
      },
      select: { id: true, nombre: true, branchId: true },
      orderBy: { nombre: 'asc' },
    }),
  ])

  return (
    <div className="p-6">
      <MetaForm
        initial={searchParams.semanaInicio ? { semanaInicio: searchParams.semanaInicio } : undefined}
        branches={branches}
        cobradores={cobradores}
      />
    </div>
  )
}
