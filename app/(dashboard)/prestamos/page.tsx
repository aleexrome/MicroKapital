import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { scopedLoanWhere } from '@/lib/access'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ApprovalBadge } from '@/components/loans/ApprovalBadge'
import { formatMoney, formatDate } from '@/lib/utils'
import { Plus, CreditCard } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Prisma, type LoanStatus } from '@prisma/client'

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

export default async function PrestamosPage({
  searchParams,
}: {
  searchParams: { estado?: string; page?: string }
}) {
  const session = await getSession()
  if (!session?.user) return null

  const { rol, companyId } = session.user

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

  const loans = await prisma.loan.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: PAGE_SIZE,
    skip: (page - 1) * PAGE_SIZE,
    include: {
      client: { select: { nombreCompleto: true } },
      cobrador: { select: { nombre: true } },
    },
  })

  // Count per-tab for badges (mismo scope que la lista principal)
  const whereCount: Prisma.LoanWhereInput = {
    companyId: companyId!,
    AND: [scopeWhere],
  }
  const countByEstado = await prisma.loan.groupBy({
    by: ['estado'],
    where: whereCount,
    _count: { _all: true },
  })
  const countMap: Record<string, number> = {}
  countByEstado.forEach((r) => { countMap[r.estado] = r._count._all })
  const totalAll = Object.values(countMap).reduce((s, v) => s + v, 0)

  const totalFiltered = estadoFiltro ? (countMap[estadoFiltro] ?? 0) : totalAll
  const totalPages    = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE))

  const canCreate = ['COORDINADOR', 'COBRADOR', 'DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'GERENTE', 'GERENTE_ZONAL', 'SUPER_ADMIN'].includes(rol)

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
          <Button asChild>
            <Link href="/prestamos/nuevo">
              <Plus className="h-4 w-4 mr-1" />
              Nuevo crédito
            </Link>
          </Button>
        )}
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1 border-b">
        {TABS.map((tab) => {
          const isActive = estadoFiltro === tab.value || (!estadoFiltro && tab.value === null)
          const href = tab.value ? `/prestamos?estado=${tab.value}` : '/prestamos'
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

      {/* List */}
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
      <PaginationBar estadoFiltro={estadoFiltro} page={page} totalPages={totalPages} />
    </div>
  )
}

function buildHref(estado: string | null, page: number) {
  const params = new URLSearchParams()
  if (estado) params.set('estado', estado)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return `/prestamos${qs ? `?${qs}` : ''}`
}

function PaginationBar({
  estadoFiltro,
  page,
  totalPages,
}: {
  estadoFiltro: string | null
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
        href={buildHref(estadoFiltro, Math.max(1, page - 1))}
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
            href={buildHref(estadoFiltro, p as number)}
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
        href={buildHref(estadoFiltro, Math.min(totalPages, page + 1))}
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
