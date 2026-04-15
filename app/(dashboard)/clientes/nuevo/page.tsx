import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { NuevoClienteForm } from './NuevoClienteForm'

export default async function NuevoClientePage() {
  const session = await getSession()
  if (!session?.user) return null

  const { rol, companyId } = session.user

  // Solo directores necesitan elegir sucursal manualmente: el resto de roles
  // (GERENTE, GERENTE_ZONAL, COORDINADOR, COBRADOR) usan automáticamente la
  // sucursal asignada a su usuario en el servidor.
  const isDirector = rol === 'DIRECTOR_GENERAL' || rol === 'DIRECTOR_COMERCIAL'

  if (!isDirector && !session.user.branchId && !session.user.zonaBranchIds?.length) {
    // Usuario de campo sin sucursal asignada: no puede crear clientes.
    redirect('/clientes')
  }

  const branches = isDirector
    ? await prisma.branch.findMany({
        where: { companyId: companyId!, activa: true },
        select: { id: true, nombre: true },
        orderBy: { nombre: 'asc' },
      })
    : []

  return <NuevoClienteForm isDirector={isDirector} branches={branches} />
}
