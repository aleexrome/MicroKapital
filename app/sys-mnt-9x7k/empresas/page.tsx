import { prisma } from '@/lib/prisma'
import { formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

const LICENSE_STATUS_BADGE: Record<string, { label: string; variant: 'success' | 'warning' | 'error' | 'secondary' }> = {
  ACTIVE:    { label: 'Activa',     variant: 'success' },
  GRACE:     { label: 'Gracia',     variant: 'warning' },
  SUSPENDED: { label: 'Suspendida', variant: 'error' },
  CANCELLED: { label: 'Cancelada',  variant: 'secondary' },
}

export default async function EmpresasPage() {
  const companies = await prisma.company.findMany({
    where: { nombre: { not: '__SYSTEM__' } },
    include: {
      license: true,
      branches: { select: { id: true, nombre: true } },
      _count: {
        select: {
          users: { where: { rol: { not: 'SUPER_ADMIN' }, activo: true } },
          clients: { where: { activo: true } },
          loans: { where: { estado: 'ACTIVE' } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Empresas cliente</h1>
        <p className="text-gray-400 text-sm">{companies.length} empresas registradas</p>
      </div>

      <div className="space-y-4">
        {companies.map((company) => {
          const licenseStatus = company.license?.estado ?? 'CANCELLED'
          const st = LICENSE_STATUS_BADGE[licenseStatus]

          return (
            <div key={company.id} className="bg-gray-800 rounded-lg p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-white text-lg">{company.nombre}</h3>
                    <Badge variant={st.variant}>{st.label}</Badge>
                  </div>
                  {company.email && <p className="text-sm text-gray-400">{company.email}</p>}
                  {company.telefono && <p className="text-sm text-gray-400">{company.telefono}</p>}

                  <div className="flex gap-4 mt-3 text-xs text-gray-400">
                    <span>👤 {company._count.users} usuarios activos</span>
                    <span>🧑 {company._count.clients} clientes activos</span>
                    <span>💰 {company._count.loans} préstamos activos</span>
                    <span>🏢 {company.branches.length} sucursal(es)</span>
                  </div>

                  {company.branches.length > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      Sucursales: {company.branches.map((b) => b.nombre).join(', ')}
                    </p>
                  )}

                  <p className="text-xs text-gray-600 mt-2">
                    Registrada: {formatDate(company.createdAt)}
                  </p>
                </div>

                <Link
                  href={`/sys-mnt-9x7k/licencias?companyId=${company.id}`}
                  className="text-xs text-yellow-400 hover:text-yellow-300 flex-shrink-0"
                >
                  Licencia →
                </Link>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
