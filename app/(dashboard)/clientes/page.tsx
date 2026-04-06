import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ScoreBadge } from '@/components/clients/ScoreBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import { UserPlus, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface SearchParams {
  q?: string
  cobrador?: string
}

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const session = await getSession()
  if (!session?.user) return null

  const { rol, companyId, branchId } = session.user

  let cobradorIdFilter: string | undefined
  if (rol === 'COBRADOR') {
    const cobrador = await prisma.user.findFirst({
      where: { companyId: companyId!, email: session.user.email! },
    })
    cobradorIdFilter = cobrador?.id
  }

  const clientes = await prisma.client.findMany({
    where: {
      companyId: companyId!,
      activo: true,
      ...(cobradorIdFilter ? { cobradorId: cobradorIdFilter } : {}),
      ...(rol === 'COBRADOR' && branchId ? { branchId } : {}),
      ...(searchParams.q ? { nombreCompleto: { contains: searchParams.q, mode: 'insensitive' as const } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      cobrador: { select: { nombre: true } },
      loans: {
        where: { estado: 'ACTIVE' },
        select: { id: true },
      },
    },
    take: 50,
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-muted-foreground">{clientes.length} clientes encontrados</p>
        </div>
        <Button asChild>
          <Link href="/clientes/nuevo">
            <UserPlus className="h-4 w-4" />
            Nuevo cliente
          </Link>
        </Button>
      </div>

      {/* Buscador */}
      <form className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            name="q"
            defaultValue={searchParams.q}
            placeholder="Buscar por nombre..."
            className="pl-9 w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <Button type="submit" variant="secondary">Buscar</Button>
      </form>

      {/* Lista */}
      <Card>
        <CardContent className="p-0">
          {clientes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No se encontraron clientes
            </div>
          ) : (
            <div className="divide-y">
              {clientes.map((cliente) => (
                <Link
                  key={cliente.id}
                  href={`/clientes/${cliente.id}`}
                  className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{cliente.nombreCompleto}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-sm text-muted-foreground">{cliente.telefono ?? 'Sin teléfono'}</p>
                      {cliente.cobrador && (
                        <p className="text-xs text-muted-foreground">· {cliente.cobrador.nombre}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    {cliente.loans.length > 0 && (
                      <Badge variant="success" className="hidden sm:flex">
                        {cliente.loans.length} activo{cliente.loans.length > 1 ? 's' : ''}
                      </Badge>
                    )}
                    <ScoreBadge score={cliente.score} showLabel={false} size="sm" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
