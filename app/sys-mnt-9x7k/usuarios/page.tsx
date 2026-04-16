import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { SuperAdminUsersTable } from './SuperAdminUsersTable'

export const dynamic = 'force-dynamic'

export default async function SuperAdminUsuariosPage() {
  const session = await getSession()
  if (!session?.user || session.user.rol !== 'SUPER_ADMIN') redirect('/login')

  const users = await prisma.user.findMany({
    where: {
      rol: { not: 'SUPER_ADMIN' },
      activo: true,
    },
    select: {
      id: true,
      nombre: true,
      email: true,
      rol: true,
      activo: true,
      permisoAplicarPagos: true,
      branch: { select: { nombre: true } },
      company: { select: { nombre: true } },
    },
    orderBy: [{ company: { nombre: 'asc' } }, { rol: 'asc' }, { nombre: 'asc' }],
  })

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Usuarios</h1>
        <p className="text-gray-400 text-sm">
          {users.length} usuarios activos · Gestiona permisos especiales
        </p>
      </div>

      <SuperAdminUsersTable users={users} />
    </div>
  )
}
