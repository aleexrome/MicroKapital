'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, UserX, UserCheck, Trash2, ShieldCheck, ShieldOff } from 'lucide-react'

interface User {
  id: string
  nombre: string
  email: string
  rol: string
  activo: boolean
  permisoAplicarPagos: boolean
  branch: { nombre: string } | null
  createdAt: string
}

const ROL_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  DIRECTOR_GENERAL: 'Director General',
  DIRECTOR_COMERCIAL: 'Director Comercial',
  GERENTE_ZONAL: 'Gerente Zonal',
  COORDINADOR: 'Coordinador',
  COBRADOR: 'Cobrador',
  GERENTE: 'Gerente',
  CLIENTE: 'Cliente',
}

interface Props {
  users: User[]
  currentUserId: string
}

export function AdminUsersTable({ users: initial, currentUserId }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [users, setUsers]   = useState(initial)
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
          ? `✅ Permiso "Aplicar pagos" otorgado a ${user.nombre}`
          : `Permiso "Aplicar pagos" retirado a ${user.nombre}`,
      })
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
    } finally {
      setLoading(null)
    }
  }

  async function toggleActivo(user: User) {
    setLoading(user.id)
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: !user.activo }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Error')
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, activo: !u.activo } : u))
      toast({ title: `Usuario ${!user.activo ? 'activado' : 'desactivado'}` })
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
    } finally {
      setLoading(null)
    }
  }

  async function deleteUser(user: User) {
    if (!confirm(`¿Desactivar permanentemente la cuenta de ${user.nombre}?`)) return
    setLoading(user.id)
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Error')
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, activo: false } : u))
      toast({ title: 'Cuenta desactivada' })
      router.refresh()
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Nombre</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Email</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Rol</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Sucursal</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Estado</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Permiso pagos</th>
            <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {users.map((user) => (
            <tr key={user.id} className={user.activo ? '' : 'opacity-50'}>
              <td className="px-4 py-3 font-medium">{user.nombre}</td>
              <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
              <td className="px-4 py-3">
                <Badge variant="secondary" className="text-xs">
                  {ROL_LABEL[user.rol] ?? user.rol}
                </Badge>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{user.branch?.nombre ?? '—'}</td>
              <td className="px-4 py-3">
                <Badge variant={user.activo ? 'success' : 'error'} className="text-xs">
                  {user.activo ? 'Activo' : 'Inactivo'}
                </Badge>
              </td>
              <td className="px-4 py-3">
                {user.permisoAplicarPagos ? (
                  <Badge
                    variant="info"
                    className="text-xs gap-1 cursor-pointer"
                    title="Puede aplicar y deshacer pagos en su sucursal"
                  >
                    <ShieldCheck className="h-3 w-3" />
                    Aplicar pagos
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1 justify-end">
                  {user.id !== currentUserId && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className={`h-7 px-2 ${user.permisoAplicarPagos ? 'border-sky-300 text-sky-600 hover:bg-sky-50' : ''}`}
                        disabled={loading === user.id}
                        onClick={() => togglePermiso(user)}
                        title={user.permisoAplicarPagos ? 'Quitar permiso de aplicar pagos' : 'Dar permiso de aplicar pagos'}
                      >
                        {loading === user.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : user.permisoAplicarPagos
                          ? <ShieldOff className="h-3 w-3" />
                          : <ShieldCheck className="h-3 w-3" />
                        }
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2"
                        disabled={loading === user.id}
                        onClick={() => toggleActivo(user)}
                        title={user.activo ? 'Desactivar' : 'Activar'}
                      >
                        {loading === user.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : user.activo
                          ? <UserX className="h-3 w-3" />
                          : <UserCheck className="h-3 w-3" />
                        }
                      </Button>
                      {user.activo && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 border-red-200 text-red-600 hover:bg-red-50"
                          disabled={loading === user.id}
                          onClick={() => deleteUser(user)}
                          title="Eliminar cuenta"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </>
                  )}
                  {user.id === currentUserId && (
                    <span className="text-xs text-muted-foreground italic">Tú</span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
