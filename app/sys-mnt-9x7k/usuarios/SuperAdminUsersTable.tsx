'use client'

import { useState } from 'react'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, ShieldCheck, ShieldOff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface User {
  id: string
  nombre: string
  email: string
  rol: string
  activo: boolean
  permisoAplicarPagos: boolean
  branch: { nombre: string } | null
  company: { nombre: string } | null
}

const ROL_LABEL: Record<string, string> = {
  DIRECTOR_GENERAL:   'Director General',
  DIRECTOR_COMERCIAL: 'Director Comercial',
  GERENTE_ZONAL:      'Gerente Zonal',
  COORDINADOR:        'Coordinador',
  COBRADOR:           'Cobrador',
  GERENTE:            'Gerente',
}

export function SuperAdminUsersTable({ users: initial }: { users: User[] }) {
  const { toast } = useToast()
  const [users, setUsers] = useState(initial)
  const [loading, setLoading] = useState<string | null>(null)

  async function togglePermiso(user: User) {
    setLoading(user.id)
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permisoAplicarPagos: !user.permisoAplicarPagos }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Error')
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id ? { ...u, permisoAplicarPagos: !u.permisoAplicarPagos } : u
        )
      )
      toast({
        title: !user.permisoAplicarPagos
          ? `✅ Permiso otorgado a ${user.nombre}`
          : `Permiso retirado a ${user.nombre}`,
      })
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Error desconocido',
        variant: 'destructive',
      })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-700">
            <th className="text-left px-4 py-3 font-medium text-gray-400">Nombre</th>
            <th className="text-left px-4 py-3 font-medium text-gray-400">Email</th>
            <th className="text-left px-4 py-3 font-medium text-gray-400">Rol</th>
            <th className="text-left px-4 py-3 font-medium text-gray-400">Sucursal</th>
            <th className="text-left px-4 py-3 font-medium text-gray-400">Empresa</th>
            <th className="text-center px-4 py-3 font-medium text-gray-400">Permiso aplicar pagos</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-700">
          {users.map((user) => (
            <tr key={user.id} className="hover:bg-gray-750 transition-colors">
              <td className="px-4 py-3 text-white font-medium">{user.nombre}</td>
              <td className="px-4 py-3 text-gray-400">{user.email}</td>
              <td className="px-4 py-3">
                <Badge variant="secondary" className="text-xs">
                  {ROL_LABEL[user.rol] ?? user.rol}
                </Badge>
              </td>
              <td className="px-4 py-3 text-gray-400">{user.branch?.nombre ?? '—'}</td>
              <td className="px-4 py-3 text-gray-400 text-xs">{user.company?.nombre ?? '—'}</td>
              <td className="px-4 py-3 text-center">
                <button
                  onClick={() => togglePermiso(user)}
                  disabled={loading === user.id}
                  title={
                    user.permisoAplicarPagos
                      ? 'Quitar permiso de aplicar pagos'
                      : 'Dar permiso de aplicar pagos'
                  }
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    user.permisoAplicarPagos
                      ? 'bg-sky-600 hover:bg-sky-700 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  }`}
                >
                  {loading === user.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : user.permisoAplicarPagos ? (
                    <>
                      <ShieldCheck className="h-3 w-3" />
                      Activo
                    </>
                  ) : (
                    <>
                      <ShieldOff className="h-3 w-3" />
                      Inactivo
                    </>
                  )}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
