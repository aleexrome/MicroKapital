import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { Prisma, type UserRole } from '@prisma/client'
import { scopedClientWhere } from '@/lib/access'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ScoreBadge } from '@/components/clients/ScoreBadge'
import { DeleteEntityButton } from '@/components/admin/DeleteEntityButton'
import { Card, CardContent } from '@/components/ui/card'
import { todayMx } from '@/lib/timezone'
import { UserPlus, Search, Filter } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface SearchParams {
  q?: string
  sucursal?: string
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

  const { companyId, rol, branchId: userBranchId, zonaBranchIds } = session.user
  const isDG = rol === 'DIRECTOR_GENERAL'
  const isDirector = rol === 'DIRECTOR_GENERAL' || rol === 'DIRECTOR_COMERCIAL' || rol === 'SUPER_ADMIN'
  const isGerenteZonal = rol === 'GERENTE_ZONAL'
  const isGerente = rol === 'GERENTE' || rol === 'GERENTE_ZONAL'
  // Roles que pueden ver más de una sucursal → tiene sentido ofrecer filtros.
  const puedeFiltrar = isDirector || isGerente

  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10))

  // Alcance por rol/sucursal. `scopedClientWhere` es fail-closed: si un
  // GERENTE / GERENTE_ZONAL / DIRECTOR no tiene sucursal asignada, devuelve
  // `{ id: '__NO_BRANCH_ASSIGNED__' }` — cero resultados en lugar de los 416
  // que veía Cristina cuando el JWT quedaba sin `branchId` ni `zonaBranchIds`.
  const where: Prisma.ClientWhereInput = {
    companyId: companyId!,
    activo: true,
    eliminadoEn: null,
    AND: [scopedClientWhere(session.user)],
  }

  if (searchParams.q) {
    where.nombreCompleto = { contains: searchParams.q, mode: 'insensitive' }
  }

  // ── Filtros adicionales de UI. El alcance base ya limita el universo
  // visible; estos sólo lo restringen más, y se validan contra el alcance
  // del usuario para que no puedan "saltarse" su zona.
  const zoneIds = zonaBranchIds?.length ? zonaBranchIds : userBranchId ? [userBranchId] : []

  if (searchParams.sucursal) {
    if (isDirector) {
      where.branchId = searchParams.sucursal
    } else if (isGerenteZonal && zoneIds.includes(searchParams.sucursal)) {
      where.branchId = searchParams.sucursal
    }
  }
  if (searchParams.cobrador && puedeFiltrar) {
    where.cobradorId = searchParams.cobrador
  }

  const [clientes, total, branches, cobradoresList] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        cobrador: { select: { nombre: true } },
        branch: { select: { nombre: true } },
        loans: {
          where: { estado: 'ACTIVE' },
          select: {
            id: true,
            schedule: {
              // Mora calculada on-the-fly (estado='OVERDUE' nunca se escribe en BD).
              where: {
                estado: { in: ['PENDING', 'PARTIAL'] },
                fechaVencimiento: { lt: todayMx() },
              },
              select: { id: true },
            },
          },
        },
      },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.client.count({ where }),

    // Sucursales para el filtro: directores ven todas; gerente zonal su zona.
    isDirector
      ? prisma.branch.findMany({
          where: { companyId: companyId!, activa: true },
          select: { id: true, nombre: true },
          orderBy: { nombre: 'asc' },
        })
      : isGerenteZonal && zoneIds.length
        ? prisma.branch.findMany({
            where: { companyId: companyId!, activa: true, id: { in: zoneIds } },
            select: { id: true, nombre: true },
            orderBy: { nombre: 'asc' },
          })
        : Promise.resolve([]),

    // Coordinadores/cobradores para el filtro (scoped a las sucursales que el
    // usuario alcanza).
    puedeFiltrar
      ? prisma.user.findMany({
          where: {
            companyId: companyId!,
            rol: { in: ['COORDINADOR' as UserRole, 'COBRADOR' as UserRole] },
            activo: true,
            ...(rol === 'GERENTE' && userBranchId ? { branchId: userBranchId } : {}),
            ...(isGerenteZonal && zoneIds.length ? { branchId: { in: zoneIds } } : {}),
          },
          select: { id: true, nombre: true },
          orderBy: { nombre: 'asc' },
        })
      : Promise.resolve([]),
  ])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hayFiltros = Boolean(searchParams.q || searchParams.sucursal || searchParams.cobrador)

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

      {/* Buscador + filtros */}
      <form className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Buscar</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              name="q"
              defaultValue={searchParams.q}
              placeholder="Nombre del cliente..."
              className="pl-9 w-64 h-9 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        {branches.length > 0 && (
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Sucursal</label>
            <select
              name="sucursal"
              defaultValue={searchParams.sucursal ?? ''}
              className="border border-input rounded-md px-3 py-1.5 text-sm h-9 min-w-[180px] bg-background text-foreground"
            >
              <option value="">Todas las sucursales</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.nombre}</option>
              ))}
            </select>
          </div>
        )}

        {cobradoresList.length > 0 && (
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Coordinador / Cobrador</label>
            <select
              name="cobrador"
              defaultValue={searchParams.cobrador ?? ''}
              className="border border-input rounded-md px-3 py-1.5 text-sm h-9 min-w-[200px] bg-background text-foreground"
            >
              <option value="">Todos</option>
              {cobradoresList.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
        )}

        <Button type="submit" variant="secondary" size="sm" className="h-9">
          <Filter className="h-3.5 w-3.5 mr-1" />Filtrar
        </Button>
        {hayFiltros && (
          <Button asChild variant="ghost" size="sm" className="h-9">
            <Link href="/clientes">Limpiar</Link>
          </Button>
        )}
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
                <div
                  key={cliente.id}
                  className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
                >
                  <Link
                    href={`/clientes/${cliente.id}`}
                    className="flex-1 min-w-0 flex items-center justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{cliente.nombreCompleto}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <p className="text-sm text-muted-foreground">{cliente.telefono ?? 'Sin teléfono'}</p>
                        {cliente.cobrador && (
                          <p className="text-xs text-muted-foreground">· {cliente.cobrador.nombre}</p>
                        )}
                        {puedeFiltrar && (
                          <p className="text-xs text-muted-foreground">· {cliente.branch.nombre}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      {cliente.loans.length > 0 && (
                        <Badge variant="success" className="hidden sm:flex">
                          {cliente.loans.length} activo{cliente.loans.length > 1 ? 's' : ''}
                        </Badge>
                      )}
                      <ScoreBadge
                        score={cliente.score}
                        overdueCount={cliente.loans.reduce((s, l) => s + l.schedule.length, 0)}
                        showLabel={false}
                        size="sm"
                      />
                    </div>
                  </Link>
                  {isDG && (
                    <div className="ml-2">
                      <DeleteEntityButton
                        endpoint={`/api/clients/${cliente.id}`}
                        entityName={cliente.nombreCompleto}
                        entityKind="cliente"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <PaginationBar searchParams={searchParams} page={page} totalPages={totalPages} />
    </div>
  )
}

function buildHref(searchParams: SearchParams, page: number) {
  const params = new URLSearchParams()
  if (searchParams.q) params.set('q', searchParams.q)
  if (searchParams.sucursal) params.set('sucursal', searchParams.sucursal)
  if (searchParams.cobrador) params.set('cobrador', searchParams.cobrador)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return `/clientes${qs ? `?${qs}` : ''}`
}

function PaginationBar({
  searchParams,
  page,
  totalPages,
}: {
  searchParams: SearchParams
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
        href={buildHref(searchParams, Math.max(1, page - 1))}
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
            href={buildHref(searchParams, p as number)}
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
        href={buildHref(searchParams, Math.min(totalPages, page + 1))}
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
