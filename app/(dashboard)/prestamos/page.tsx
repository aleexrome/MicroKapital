import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { scopedLoanWhere } from '@/lib/access'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ApprovalBadge } from '@/components/loans/ApprovalBadge'
import { formatMoney, formatDate } from '@/lib/utils'
import { Plus, CreditCard, Filter } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Prisma, type LoanStatus, type UserRole } from '@prisma/client'
import { tienePrestamosEnLimbo72h } from '@/lib/limbo-status'

const TABS: { label: string; value: string | null }[] = [
  { label: 'Todos', value: null },
  { label: 'Pendientes', value: 'PENDING_APPROVAL' },
  { label: 'Aprobados', value: 'APPROVED' },
  { label: 'En activación', value: 'IN_ACTIVATION' },
  { label: 'Activos', value: 'ACTIVE' },
  { label: 'Rechazados', value: 'REJECTED' },
  { label: 'Cancelados', value: 'DECLINED' },
]

const PAGE_SIZE = 50

interface SearchParams {
  estado?: string
  sucursal?: string
  cobrador?: string
  page?: string
}

export default async function PrestamosPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const session = await getSession()
  if (!session?.user) return null

  const { rol, companyId, branchId: userBranchId, zonaBranchIds, id: userId } = session.user

  const isDirector = rol === 'DIRECTOR_GENERAL' || rol === 'DIRECTOR_COMERCIAL' || rol === 'MESA_CONTROL' || rol === 'SUPER_ADMIN'
  const isGerenteZonal = rol === 'GERENTE_ZONAL'
  const isGerente = rol === 'GERENTE' || rol === 'GERENTE_ZONAL'
  // Roles que ven más de una sucursal → tiene sentido mostrarles los filtros
  // de sucursal y coordinador (igual criterio que en /clientes).
  const puedeFiltrar = isDirector || isGerente

  const estadoFiltro = searchParams.estado ?? null
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10))

  // Alcance por rol/sucursal (fail-closed): si un GERENTE / GERENTE_ZONAL /
  // DIRECTOR no tiene sucursal asignada, la query no devuelve nada en vez
  // de devolver todos los préstamos de la empresa.
  const scopeWhere = scopedLoanWhere(session.user)

  const where: Prisma.LoanWhereInput = {
    companyId: companyId!,
    AND: [scopeWhere],
  }

  if (estadoFiltro) where.estado = estadoFiltro as LoanStatus

  // Filtros adicionales de UI. El alcance base ya limita el universo
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

  const [loans, branches, cobradoresList, countByEstado] = await Promise.all([
    prisma.loan.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: {
        client: { select: { nombreCompleto: true } },
        cobrador: { select: { nombre: true } },
      },
    }),

    // Sucursales para el filtro: directores/mesa control ven todas; gerente
    // zonal su zona; gerente y coordinador no tienen dropdown.
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

    // Coordinadores/cobradores para el filtro. Si el usuario eligió una
    // sucursal específica, restringimos la lista de coordinadores a esa
    // sucursal — así el dropdown no ofrece coordinadores de otras plazas.
    puedeFiltrar
      ? prisma.user.findMany({
          where: {
            companyId: companyId!,
            rol: { in: ['COORDINADOR' as UserRole, 'COBRADOR' as UserRole] },
            activo: true,
            ...(rol === 'GERENTE' && userBranchId ? { branchId: userBranchId } : {}),
            ...(isGerenteZonal && zoneIds.length ? { branchId: { in: zoneIds } } : {}),
            ...(searchParams.sucursal ? { branchId: searchParams.sucursal } : {}),
          },
          select: { id: true, nombre: true },
          orderBy: { nombre: 'asc' },
        })
      : Promise.resolve([]),

    // Count per-tab for badges: usa el MISMO where (scope + filtros de
    // sucursal/coordinador) menos el estado, para que los contadores
    // reflejen lo mismo que se está viendo.
    prisma.loan.groupBy({
      by: ['estado'],
      where: (() => {
        const w = { ...where }
        delete w.estado
        return w
      })(),
      _count: { _all: true },
    }),
  ])

  const countMap: Record<string, number> = {}
  countByEstado.forEach((r) => { countMap[r.estado] = r._count._all })
  const totalAll = Object.values(countMap).reduce((s, v) => s + v, 0)

  const totalFiltered = estadoFiltro ? (countMap[estadoFiltro] ?? 0) : totalAll
  const totalPages    = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE))

  const hayFiltros = Boolean(searchParams.sucursal || searchParams.cobrador)

  const canCreate = ['COORDINADOR', 'COBRADOR', 'DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'GERENTE', 'GERENTE_ZONAL', 'SUPER_ADMIN'].includes(rol)

  // Si la cobradora está bloqueada por limbo > 72h, deshabilitamos el botón
  // de crear con tooltip explicativo. DG/DC/SA no se autobloqquean.
  const limboCheck = (rol === 'COORDINADOR' || rol === 'COBRADOR' || rol === 'GERENTE' || rol === 'GERENTE_ZONAL')
    ? await tienePrestamosEnLimbo72h(userId, prisma)
    : { bloqueado: false, prestamosEnLimbo: [] }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Solicitudes de Crédito</h1>
          <p className="text-muted-foreground">
            {totalFiltered} registro(s) · página {page} de {totalPages}
          </p>
        </div>
        {canCreate && (
          limboCheck.bloqueado ? (
            <Button
              disabled
              title={`Bloqueado: ${limboCheck.prestamosEnLimbo.length} préstamo(s) pendiente(s) > 72h. Activa o cancela antes de crear nuevos.`}
            >
              <Plus className="h-4 w-4 mr-1" />
              Nuevo crédito
            </Button>
          ) : (
            <Button asChild>
              <Link href="/prestamos/nuevo">
                <Plus className="h-4 w-4 mr-1" />
                Nuevo crédito
              </Link>
            </Button>
          )
        )}
      </div>

      {/* Filtros de sucursal / coordinador (mismo patrón que /clientes) */}
      {puedeFiltrar && (branches.length > 0 || cobradoresList.length > 0) && (
        <form className="flex flex-wrap gap-3 items-end">
          {/* Preservar estado seleccionado al aplicar filtros */}
          {estadoFiltro && (
            <input type="hidden" name="estado" value={estadoFiltro} />
          )}

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
              <Link href={estadoFiltro ? `/prestamos?estado=${estadoFiltro}` : '/prestamos'}>
                Limpiar
              </Link>
            </Button>
          )}
        </form>
      )}

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1 border-b">
        {TABS.map((tab) => {
          const isActive = estadoFiltro === tab.value || (!estadoFiltro && tab.value === null)
          const href = buildHref(searchParams, 1, tab.value)
          const count = tab.value === null ? totalAll : (countMap[tab.value] ?? 0)
          return (
            <Link
              key={tab.label}
              href={href}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
                isActive
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-muted-foreground hover:text-gray-700'
              )}
            >
              {tab.label}
              {count > 0 && (
                <span className={cn(
                  'ml-1.5 text-xs rounded-full px-1.5 py-0.5',
                  isActive ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-500'
                )}>
                  {count}
                </span>
              )}
            </Link>
          )
        })}
      </div>

      {/* Lista */}
      <Card>
        <CardContent className="p-0">
          {loans.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CreditCard className="h-10 w-10 mx-auto mb-3" />
              No hay solicitudes{estadoFiltro ? ' con este estado' : ''}
            </div>
          ) : (
            <div className="divide-y">
              {loans.map((loan) => (
                <Link
                  key={loan.id}
                  href={`/prestamos/${loan.id}`}
                  className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{loan.client.nombreCompleto}</p>
                    <p className="text-sm text-muted-foreground">
                      {loan.tipo} · {loan.cobrador.nombre} · {formatDate(loan.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-2">
                    <span className="font-semibold text-sm">{formatMoney(Number(loan.capital))}</span>
                    <ApprovalBadge status={loan.estado as LoanStatus} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {/* Paginación inferior */}
      <PaginationBar searchParams={searchParams} page={page} totalPages={totalPages} />
    </div>
  )
}

function buildHref(sp: SearchParams, page: number, estadoOverride?: string | null) {
  const params = new URLSearchParams()
  const estado = estadoOverride === undefined ? sp.estado : estadoOverride
  if (estado) params.set('estado', estado)
  if (sp.sucursal) params.set('sucursal', sp.sucursal)
  if (sp.cobrador) params.set('cobrador', sp.cobrador)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return `/prestamos${qs ? `?${qs}` : ''}`
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
