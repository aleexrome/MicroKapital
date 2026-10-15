import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { ConcentradoresTable } from '@/components/admin/ConcentradoresTable'
import { ROLES_HACEN_CORTE } from '@/lib/cortes'
import { Users } from 'lucide-react'

/**
 * Admin UI — asignar concentrador local por sucursal.
 *
 * Solo DG / SUPER_ADMIN. Si alguien se da de baja o rota de puesto,
 * desde aquí se cambia inmediatamente el concentradorUserId del Branch
 * — sin suplencias automáticas (confirmado con Dirección).
 */
export default async function ConcentradoresPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  if (!['DIRECTOR_GENERAL', 'SUPER_ADMIN'].includes(session.user.rol)) {
    redirect('/dashboard')
  }

  const branches = await prisma.branch.findMany({
    where:   { companyId: session.user.companyId!, activa: true },
    orderBy: { nombre: 'asc' },
    include: {
      concentrador: { select: { id: true, nombre: true, rol: true } },
    },
  })

  // Candidatos a ser concentradores: cualquier user activo con rol que
  // haga corte (COBRADOR, COORDINADOR, GERENTE, GERENTE_ZONAL, MC).
  // DG/DC/SA no son candidatos — ellos son el último eslabón.
  const candidatos = await prisma.user.findMany({
    where: {
      companyId: session.user.companyId!,
      activo:    true,
      rol:       { in: [...ROLES_HACEN_CORTE] },
    },
    select:  { id: true, nombre: true, rol: true, branch: { select: { nombre: true } } },
    orderBy: [{ nombre: 'asc' }],
  })

  const rows = branches.map((b) => ({
    branchId:     b.id,
    branchNombre: b.nombre,
    concentrador: b.concentrador,
  }))

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-gray-900 text-white rounded-lg p-2">
          <Users className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Concentradores por sucursal</h1>
          <p className="text-muted-foreground text-sm">
            Quién recibe el corte del día de los coords de cada sucursal.
            Sin concentrador = los coords entregan directo a DG/DC.
          </p>
        </div>
      </div>

      <ConcentradoresTable rows={rows} candidatos={candidatos} />
    </div>
  )
}
