export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import { formatMoney, formatDate } from '@/lib/utils'
import { parseMxYMD, todayMx } from '@/lib/timezone'
import { scopedLoanWhere, loanNotDeletedWhere } from '@/lib/access'
import type { Prisma } from '@prisma/client'

const ROLES_PERMITIDOS = ['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'SUPER_ADMIN', 'GERENTE_ZONAL']

interface SearchParams {
  desde?: string
  hasta?: string
  sucursal?: string
  cobrador?: string
  estado?: 'todas' | 'cobradas' | 'pendientes'
}

export default async function ReporteMorasPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  if (!ROLES_PERMITIDOS.includes(session.user.rol)) redirect('/dashboard')

  const { companyId, rol, branchId: userBranchId, zonaBranchIds, id: userId } = session.user

  const isDirector = rol === 'DIRECTOR_GENERAL' || rol === 'DIRECTOR_COMERCIAL' || rol === 'SUPER_ADMIN'
  const isGerenteZonal = rol === 'GERENTE_ZONAL'

  const accessUser = { id: userId, rol, branchId: userBranchId, zonaBranchIds }

  // Rango de fechas — default: últimos 30 días.
  const validoYmd = /^\d{4}-\d{2}-\d{2}$/
  const hoy = todayMx()
  const hace30 = new Date(hoy)
  hace30.setUTCDate(hace30.getUTCDate() - 30)
  const desde = searchParams.desde && validoYmd.test(searchParams.desde)
    ? parseMxYMD(searchParams.desde)
    : hace30
  const hasta = searchParams.hasta && validoYmd.test(searchParams.hasta)
    ? parseMxYMD(searchParams.hasta)
    : hoy

  // Ampliamos hasta al final del día (23:59:59.999 CDMX)
  const hastaEnd = new Date(hasta)
  hastaEnd.setUTCDate(hastaEnd.getUTCDate() + 1)

  // Sucursal / cobrador — validados contra scope del usuario.
  const zoneIds = zonaBranchIds?.length ? zonaBranchIds : userBranchId ? [userBranchId] : []
  const branchIdFiltro = searchParams.sucursal
    ? (isDirector ? searchParams.sucursal
        : isGerenteZonal && zoneIds.includes(searchParams.sucursal) ? searchParams.sucursal
        : null)
    : null

  const cobradorIdFiltro = searchParams.cobrador ?? null
  const estado = searchParams.estado ?? 'todas'

  const where: Prisma.MoraCobroWhereInput = {
    companyId: companyId!,
    createdAt: { gte: desde, lt: hastaEnd },
    loan: {
      companyId: companyId!,
      AND: [scopedLoanWhere(accessUser), loanNotDeletedWhere],
    },
    ...(branchIdFiltro ? { branchId: branchIdFiltro } : {}),
    ...(cobradorIdFiltro ? { cobradorId: cobradorIdFiltro } : {}),
    ...(estado === 'cobradas' ? { cobrada: true } : {}),
    ...(estado === 'pendientes' ? { cobrada: false } : {}),
  }

  const [moras, branches, cobradores, aggByTipo] = await Promise.all([
    prisma.moraCobro.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        branch: { select: { nombre: true } },
        cobrador: { select: { nombre: true } },
        client: { select: { nombreCompleto: true } },
        loan: { select: { id: true, tipo: true } },
        schedule: { select: { numeroPago: true } },
      },
    }),

    // Sucursales para el dropdown (scoped al usuario)
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

    // Cobradores para el dropdown — restringidos por sucursal si aplica.
    prisma.user.findMany({
      where: {
        companyId: companyId!,
        activo: true,
        rol: { in: ['COORDINADOR', 'COBRADOR'] },
        ...(branchIdFiltro ? { branchId: branchIdFiltro } : {}),
        ...(isGerenteZonal && zoneIds.length ? { branchId: { in: zoneIds } } : {}),
      },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),

    // Agregado por tipo (MULTA vs MORA) para los totales.
    prisma.moraCobro.groupBy({
      by: ['tipo', 'cobrada'],
      where,
      _sum: { monto: true },
      _count: { _all: true },
    }),
  ])

  const totalGeneradoMonto  = aggByTipo.reduce((s, r) => s + Number(r._sum.monto ?? 0), 0)
  const totalGeneradoCount  = aggByTipo.reduce((s, r) => s + r._count._all, 0)
  const totalCobradoMonto   = aggByTipo.filter((r) => r.cobrada).reduce((s, r) => s + Number(r._sum.monto ?? 0), 0)
  const totalCobradoCount   = aggByTipo.filter((r) => r.cobrada).reduce((s, r) => s + r._count._all, 0)
  const totalPendienteMonto = totalGeneradoMonto - totalCobradoMonto
  const totalPendienteCount = totalGeneradoCount - totalCobradoCount

  const desdeYmd = desde.toISOString().slice(0, 10)
  const hastaYmd = hasta.toISOString().slice(0, 10)

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/reportes"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Multas y moras
          </h1>
          <p className="text-muted-foreground text-sm">
            {formatDate(desde)} – {formatDate(hasta)} · {totalGeneradoCount} evento(s) generado(s)
          </p>
        </div>
      </div>

      {/* Filtros */}
      <form className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Desde</label>
          <input
            type="date"
            name="desde"
            defaultValue={desdeYmd}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm h-9"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Hasta</label>
          <input
            type="date"
            name="hasta"
            defaultValue={hastaYmd}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm h-9"
          />
        </div>
        {branches.length > 0 && (
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Sucursal</label>
            <select
              name="sucursal"
              defaultValue={searchParams.sucursal ?? ''}
              className="border border-input rounded-md px-3 py-1.5 text-sm h-9 min-w-[180px] bg-background"
            >
              <option value="">Todas</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.nombre}</option>
              ))}
            </select>
          </div>
        )}
        {cobradores.length > 0 && (
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Coordinador</label>
            <select
              name="cobrador"
              defaultValue={searchParams.cobrador ?? ''}
              className="border border-input rounded-md px-3 py-1.5 text-sm h-9 min-w-[180px] bg-background"
            >
              <option value="">Todos</option>
              {cobradores.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Estado</label>
          <select
            name="estado"
            defaultValue={estado}
            className="border border-input rounded-md px-3 py-1.5 text-sm h-9 min-w-[140px] bg-background"
          >
            <option value="todas">Todas</option>
            <option value="cobradas">Solo cobradas</option>
            <option value="pendientes">Solo pendientes</option>
          </select>
        </div>
        <Button type="submit" variant="secondary" size="sm" className="h-9">Filtrar</Button>
      </form>

      {/* Totales */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Total generado</p>
            <p className="text-2xl font-bold text-amber-400">{formatMoney(totalGeneradoMonto)}</p>
            <p className="text-xs text-muted-foreground">{totalGeneradoCount} evento(s)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Cobrado</p>
            <p className="text-2xl font-bold text-emerald-400">{formatMoney(totalCobradoMonto)}</p>
            <p className="text-xs text-muted-foreground">{totalCobradoCount} evento(s)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Pendiente</p>
            <p className="text-2xl font-bold text-rose-400">{formatMoney(totalPendienteMonto)}</p>
            <p className="text-xs text-muted-foreground">{totalPendienteCount} evento(s)</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabla */}
      <Card>
        <CardHeader><CardTitle className="text-base">Detalle</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {moras.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              Sin registros en el rango seleccionado.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/40 text-xs text-muted-foreground">
                  <th className="text-left px-4 py-2 font-medium">Fecha</th>
                  <th className="text-left px-4 py-2 font-medium">Sucursal</th>
                  <th className="text-left px-4 py-2 font-medium">Cobrador</th>
                  <th className="text-left px-4 py-2 font-medium">Cliente</th>
                  <th className="text-left px-4 py-2 font-medium">Pago #</th>
                  <th className="text-left px-4 py-2 font-medium">Tipo</th>
                  <th className="text-right px-4 py-2 font-medium">Monto</th>
                  <th className="text-right px-4 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {moras.map((m) => (
                  <tr key={m.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2 text-muted-foreground">{formatDate(m.createdAt)}</td>
                    <td className="px-4 py-2">{m.branch.nombre}</td>
                    <td className="px-4 py-2">{m.cobrador.nombre}</td>
                    <td className="px-4 py-2">
                      <Link href={`/prestamos/${m.loan.id}`} className="hover:underline text-primary">
                        {m.client.nombreCompleto}
                      </Link>
                      <p className="text-[11px] text-muted-foreground">{m.loan.tipo}</p>
                    </td>
                    <td className="px-4 py-2">{m.schedule.numeroPago}</td>
                    <td className="px-4 py-2">
                      <span className={m.tipo === 'MORA' ? 'text-rose-500 font-medium' : 'text-amber-500 font-medium'}>
                        {m.tipo === 'MORA' ? 'Mora' : 'Multa'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-semibold money">{formatMoney(Number(m.monto))}</td>
                    <td className="px-4 py-2 text-right">
                      {m.cobrada ? (
                        <span className="text-emerald-500 text-xs font-medium">Cobrada</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">Pendiente</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
