export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/session'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { MetaForm } from '@/components/reportes/MetaForm'

const ROLES_DEFINEN = ['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL']

export default async function EditarMetaPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  const { rol, companyId } = session.user
  if (!ROLES_DEFINEN.includes(rol)) redirect('/reportes/metas')

  const goal = await prisma.goal.findFirst({
    where: { id: params.id, companyId: companyId! },
  })
  if (!goal) notFound()

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
        initial={{
          id: goal.id,
          branchId: goal.branchId,
          cobradorId: goal.cobradorId,
          loanType: goal.loanType,
          semanaInicio: goal.semanaInicio.toISOString().slice(0, 10),
          metaCapitalColocado: goal.metaCapitalColocado != null ? Number(goal.metaCapitalColocado) : null,
          metaCreditosColocados: goal.metaCreditosColocados,
          metaCobranzaEsperada: goal.metaCobranzaEsperada != null ? Number(goal.metaCobranzaEsperada) : null,
          metaCobranzaEfectiva: goal.metaCobranzaEfectiva != null ? Number(goal.metaCobranzaEfectiva) : null,
          metaMoraMaxima: goal.metaMoraMaxima != null ? Number(goal.metaMoraMaxima) : null,
          metaCrecimiento: goal.metaCrecimiento != null ? Number(goal.metaCrecimiento) : null,
          notas: goal.notas,
        }}
        branches={branches}
        cobradores={cobradores}
      />
    </div>
  )
}
