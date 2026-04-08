import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatMoney, formatDate } from '@/lib/utils'
import { CheckCircle, FileText, Filter } from 'lucide-react'
import Link from 'next/link'
import type { UserRole } from '@prisma/client'

const TIPO_LABEL: Record<string, string> = {
  SOLIDARIO: 'Solidario',
  INDIVIDUAL: 'Individual',
  AGIL: 'Ágil',
  FIDUCIARIO: 'Fiduciario',
}

const PAGE_SIZE = 40

export default async function CreditosConcluidos({
  searchParams,
}: {
  searchParams: { branchId?: string; cobradorId?: string; clienteQ?: string; page?: string }
}) {
  const session = await getSession()
  if (!session?.user) return null

  const { rol, companyId, branchId: userBranchId, id: userId } = session.user

  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10))
  const skip = (page - 1) * PAGE_SIZE

  // ── Build WHERE depending on role ────────────────────────────────────────────

  type LoanWhere = Parameters<typeof prisma.loan.findMany>[0]['where']
  const baseWhere: LoanWhere = { companyId: companyId!, estado: 'LIQUIDATED' }

  const isDirector = rol === 'DIRECTOR_GENERAL' || rol === 'DIRECTOR_COMERCIAL'
  const isGerente  = rol === 'GERENTE_ZONAL' || rol === 'GERENTE'
  const isCampo    = rol === 'COORDINADOR' || rol === 'COBRADOR'

  // Directors: optionally filter by branch
  if (isDirector) {
    if (searchParams.branchId) baseWhere.branchId = searchParams.branchId
  }

  // Gerente Zonal: restrict to zone branches + optional coordinador filter
  if (rol === 'GERENTE_ZONAL') {
    const zoneIds = session.user.zonaBranchIds
    if (zoneIds && zoneIds.length > 0) {
      baseWhere.branchId = searchParams.branchId && zoneIds.includes(searchParams.branchId)
        ? searchParams.branchId
        : { in: zoneIds }
    }
    if (searchParams.cobradorId) baseWhere.cobradorId = searchParams.cobradorId
  }

  // Gerente (legacy): restrict to own branch + optional coordinador filter
  if (rol === 'GERENTE') {
    if (userBranchId) baseWhere.branchId = userBranchId
    if (searchParams.cobradorId) baseWhere.cobradorId = searchParams.cobradorId
  }

  // Campo: own loans + optional client search
  if (isCampo) {
    baseWhere.cobradorId = userId
    if (searchParams.clienteQ) {
      baseWhere.client = {
        nombreCompleto: { contains: searchParams.clienteQ, mode: 'insensitive' },
      }
    }
  }

  // ── Fetch filter options (for dropdowns / autocomplete) ───────────────────────

  const [loans, total, branches, coordinadoresList] = await Promise.all([
    prisma.loan.findMany({
      where: baseWhere,
      orderBy: { updatedAt: 'desc' },
      skip,
      take: PAGE_SIZE,
      include: {
        client: { select: { id: true, nombreCompleto: true } },
        cobrador: { select: { id: true, nombre: true } },
        branch: { select: { nombre: true } },
        payments: { orderBy: { fechaHora: 'desc' }, take: 1, select: { fechaHora: true } },
      },
    }),
    prisma.loan.count({ where: baseWhere }),

    // Branches for director filter
    isDirector
      ? prisma.branch.findMany({
          where: { companyId: companyId!, activa: true },
          select: { id: true, nombre: true },
          orderBy: { nombre: 'asc' },
        })
      : Promise.resolve([]),

    // Coordinadores/Cobradores for gerente filter
    isGerente
      ? prisma.user.findMany({
          where: {
            companyId: companyId!,
            rol: { in: ['COORDINADOR' as UserRole, 'COBRADOR' as UserRole] },
            activo: true,
            ...(rol === 'GERENTE' && userBranchId ? { branchId: userBranchId } : {}),
          },
          select: { id: true, nombre: true },
          orderBy: { nombre: 'asc' },
        })
      : Promise.resolve([]),
  ])

  // ── Summary totals ────────────────────────────────────────────────────────────

  const agg = await prisma.loan.aggregate({
    where: baseWhere,
    _sum: { capital: true, totalPago: true },
  })
  const totalCapital   = Number(agg._sum.capital   ?? 0)
  const totalRecuperado = Number(agg._sum.totalPago ?? 0)

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Créditos Concluidos</h1>
        <p className="text-muted-foreground">{total} crédito(s) liquidado(s)</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Total créditos</p>
            <p className="text-2xl font-bold text-gray-900">{total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Capital colocado</p>
            <p className="text-2xl font-bold text-green-700">{formatMoney(totalCapital)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Total recuperado</p>
            <p className="text-2xl font-bold text-blue-700">{formatMoney(totalRecuperado)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      {(isDirector || isGerente || isCampo) && (
        <Card>
          <CardContent className="p-4">
            <form method="GET" action="/creditos-concluidos" className="flex flex-wrap gap-3 items-end">
              {/* Branch filter — directors */}
              {isDirector && branches.length > 0 && (
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Sucursal</label>
                  <select
                    name="branchId"
                    defaultValue={searchParams.branchId ?? ''}
                    className="border rounded px-3 py-1.5 text-sm min-w-[180px]"
                  >
                    <option value="">Todas las sucursales</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.nombre}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Coordinador filter — gerentes */}
              {isGerente && coordinadoresList.length > 0 && (
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Coordinador / Cobrador</label>
                  <select
                    name="cobradorId"
                    defaultValue={searchParams.cobradorId ?? ''}
                    className="border rounded px-3 py-1.5 text-sm min-w-[200px]"
                  >
                    <option value="">Todos</option>
                    {coordinadoresList.map((c) => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Client search — campo */}
              {isCampo && (
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Buscar cliente</label>
                  <input
                    type="text"
                    name="clienteQ"
                    defaultValue={searchParams.clienteQ ?? ''}
                    placeholder="Nombre del cliente..."
                    className="border rounded px-3 py-1.5 text-sm min-w-[220px]"
                  />
                </div>
              )}

              <Button type="submit" size="sm" variant="outline">
                <Filter className="h-3 w-3 mr-1" />Filtrar
              </Button>
              {(searchParams.branchId || searchParams.cobradorId || searchParams.clienteQ) && (
                <Button asChild size="sm" variant="ghost">
                  <Link href="/creditos-concluidos">Limpiar</Link>
                </Button>
              )}
            </form>
          </CardContent>
        </Card>
      )}

      {/* List */}
      {loans.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-3" />
            <p className="text-muted-foreground">No hay créditos concluidos con los filtros aplicados</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {loans.map((loan) => {
            const liquidadoAt = loan.payments[0]?.fechaHora ?? loan.updatedAt
            return (
              <Card key={loan.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant="success" className="text-xs">Liquidado</Badge>
                        <Badge variant="secondary" className="text-xs">{TIPO_LABEL[loan.tipo] ?? loan.tipo}</Badge>
                        <span className="text-xs text-muted-foreground">{loan.branch.nombre}</span>
                      </div>
                      <p className="font-semibold text-gray-900">{loan.client.nombreCompleto}</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-0.5 mt-1.5 text-sm">
                        <div>
                          <span className="text-muted-foreground">Capital: </span>
                          <span className="font-medium">{formatMoney(Number(loan.capital))}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Total: </span>
                          <span className="font-medium">{formatMoney(Number(loan.totalPago))}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Coordinador: </span>
                          <span>{loan.cobrador.nombre}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Liquidado: </span>
                          <span>{formatDate(liquidadoAt)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/prestamos/${loan.id}`}>
                          <FileText className="h-3 w-3 mr-1" />Ver
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/creditos-concluidos/${loan.id}/pdf`}>
                          <FileText className="h-3 w-3 mr-1" />PDF
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {page > 1 && (
            <Button asChild size="sm" variant="outline">
              <Link href={`/creditos-concluidos?page=${page - 1}${searchParams.branchId ? `&branchId=${searchParams.branchId}` : ''}${searchParams.cobradorId ? `&cobradorId=${searchParams.cobradorId}` : ''}${searchParams.clienteQ ? `&clienteQ=${searchParams.clienteQ}` : ''}`}>
                Anterior
              </Link>
            </Button>
          )}
          <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
          {page < totalPages && (
            <Button asChild size="sm" variant="outline">
              <Link href={`/creditos-concluidos?page=${page + 1}${searchParams.branchId ? `&branchId=${searchParams.branchId}` : ''}${searchParams.cobradorId ? `&cobradorId=${searchParams.cobradorId}` : ''}${searchParams.clienteQ ? `&clienteQ=${searchParams.clienteQ}` : ''}`}>
                Siguiente
              </Link>
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
