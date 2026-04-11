import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ScoreBadge } from '@/components/clients/ScoreBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import { UserPlus, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface SearchParams {
  q?: string
  cobrador?: string
  page?: string
}

const PAGE_SIZE = 50

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const session = await getSession()
  if (!session?.user) return null

  const { rol, companyId, branchId, id: userId } = session.user

  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10))

  const where: Prisma.ClientWhereInput = {
    companyId: companyId!,
    activo: true,
  }

  if (searchParams.q) {
    where.nombreCompleto = { contains: searchParams.q, mode: 'insensitive' }
  }

  // COBRADOR: solo sus clientes en su sucursal
  if (rol === 'COBRADOR') {
    where.cobradorId = userId
    if (branchId) where.branchId = branchId
  }

  // GERENTE: clientes de su(s) sucursal(es) + sus propios clientes
  if (rol === 'GERENTE') {
    const branchIds = session.user.zonaBranchIds?.length
      ? session.user.zonaBranchIds
      : branchId ? [branchId] : null
    if (branchIds?.length) {
      where.OR = [
        { branchId: { in: branchIds } },
        { cobradorId: userId },
      ]
    }
  }

  // GERENTE_ZONAL: sus sucursales asignadas
  if (rol === 'GERENTE_ZONAL') {
    const zoneIds = session.user.zonaBranchIds
    if (zoneIds?.length) where.branchId = { in: zoneIds }
  }

  const [clientes, total] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        cobrador: { select: { nombre: true } },
        loans: {
          where: { estado: 'ACTIVE' },
          select: { id: true },
        },
      },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.client.count({ where }),
  ])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cartera de Clientes</h1>
          <p className="text-muted-foreground">
            {total} cliente(s) · página {page} de {totalPages}
          </p>
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

      <PaginationBar q={searchParams.q ?? null} page={page} totalPages={totalPages} />
    </div>
  )
}

function buildHref(q: string | null, page: number) {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return `/clientes${qs ? `?${qs}` : ''}`
}

function PaginationBar({
  q,
  page,
  totalPages,
}: {
  q: string | null
  page: number
  totalPages: number
}) {
  if (totalPages <= 1) return null

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
    .reduce<(number | '…')[]>((acc, p, idx, arr) => {
      if (idx > 0 && typeof arr[idx - 1] === 'number' && (p as number) - (arr[idx - 1] as number) > 1)
        acc.push('…')
      acc.push(p)
      return acc
    }, [])

  return (
    <div className="flex items-center justify-center gap-2 py-1">
      <Link
        href={buildHref(q, Math.max(1, page - 1))}
        className={cn(
          'px-3 py-1.5 text-sm rounded-md border transition-colors',
          page <= 1
            ? 'pointer-events-none opacity-40 border-border text-muted-foreground'
            : 'border-border hover:bg-secondary text-foreground',
        )}
      >
        ← Anterior
      </Link>

      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`e-${i}`} className="px-1 text-muted-foreground">…</span>
        ) : (
          <Link
            key={p}
            href={buildHref(q, p as number)}
            className={cn(
              'w-8 h-8 flex items-center justify-center text-sm rounded-md border transition-colors',
              p === page
                ? 'bg-primary-500 border-primary-500 text-white font-semibold'
                : 'border-border hover:bg-secondary text-foreground',
            )}
          >
            {p}
          </Link>
        ),
      )}

      <Link
        href={buildHref(q, Math.min(totalPages, page + 1))}
        className={cn(
          'px-3 py-1.5 text-sm rounded-md border transition-colors',
          page >= totalPages
            ? 'pointer-events-none opacity-40 border-border text-muted-foreground'
            : 'border-border hover:bg-secondary text-foreground',
        )}
      >
        Siguiente →
      </Link>
    </div>
  )
}
