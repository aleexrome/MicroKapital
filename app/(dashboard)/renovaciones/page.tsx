export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { Card } from '@/components/ui/card'
import { formatMoney, formatDate } from '@/lib/utils'
import { Zap, RefreshCcw, Sparkles, Users, Building2, User as UserIcon } from 'lucide-react'
import { loanNotDeletedWhere } from '@/lib/access'

// Umbrales de "pagos ya cubiertos" para habilitar renovación anticipada,
// por tipo de crédito. FIDUCIARIO queda fuera — no aplica renovación
// anticipada.
const UMBRAL_POR_TIPO: Record<string, number> = {
  INDIVIDUAL: 10,
  SOLIDARIO:  7,
  AGIL:       20,
}

const LABEL_TIPO: Record<string, string> = {
  INDIVIDUAL: 'Individual',
  SOLIDARIO:  'Solidario',
  AGIL:       'Ágil',
  FIDUCIARIO: 'Fiduciario',
}

function scoreBadge(score: number): string {
  if (score >= 700) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
  if (score >= 500) return 'bg-amber-500/15 text-amber-300 border-amber-500/40'
  return 'bg-rose-500/15 text-rose-300 border-rose-500/40'
}

function diasSinColor(dias: number): string {
  if (dias <= 14) return 'text-emerald-400'
  if (dias <= 30) return 'text-amber-400'
  return 'text-rose-400'
}

type GrupoCoord<T> = {
  cobradorId:     string
  cobradorNombre: string
  rows:           T[]
}

type GrupoSucursal<T> = {
  branchId:     string
  branchNombre: string
  totalRows:    number
  coords:       GrupoCoord<T>[]
}

function agrupar<T extends { branchId: string; branchNombre: string; cobradorId: string; cobradorNombre: string }>(
  rows: T[],
): GrupoSucursal<T>[] {
  const porBranch = new Map<string, Map<string, GrupoCoord<T>>>()
  const branchNombres = new Map<string, string>()
  for (const r of rows) {
    branchNombres.set(r.branchId, r.branchNombre)
    const coords = porBranch.get(r.branchId) ?? new Map<string, GrupoCoord<T>>()
    const cob = coords.get(r.cobradorId) ?? { cobradorId: r.cobradorId, cobradorNombre: r.cobradorNombre, rows: [] }
    cob.rows.push(r)
    coords.set(r.cobradorId, cob)
    porBranch.set(r.branchId, coords)
  }
  return Array.from(porBranch.entries())
    .map(([branchId, coords]) => {
      const coordArr = Array.from(coords.values())
        .sort((a, b) => b.rows.length - a.rows.length || a.cobradorNombre.localeCompare(b.cobradorNombre))
      const total = coordArr.reduce((s, c) => s + c.rows.length, 0)
      return {
        branchId,
        branchNombre: branchNombres.get(branchId) ?? '—',
        totalRows: total,
        coords: coordArr,
      }
    })
    .sort((a, b) => b.totalRows - a.totalRows || a.branchNombre.localeCompare(b.branchNombre))
}

export default async function RenovacionesPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  const { rol, companyId } = session.user
  if (!['MESA_CONTROL', 'DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'SUPER_ADMIN'].includes(rol)) {
    redirect('/dashboard')
  }
  if (!companyId) redirect('/dashboard')

  const hoy = new Date()
  const hace60Dias = new Date(hoy.getTime() - 60 * 24 * 60 * 60 * 1000)

  // ───────────────────────────────────────────────────────────────────
  // RENOVACIÓN ANTICIPADA
  // ───────────────────────────────────────────────────────────────────
  const loansActivos = await prisma.loan.findMany({
    where: {
      companyId,
      estado: 'ACTIVE',
      tipo:   { in: ['INDIVIDUAL', 'SOLIDARIO', 'AGIL'] },
      AND:    [loanNotDeletedWhere],
    },
    select: {
      id: true, tipo: true, capital: true,
      client:   { select: { id: true, nombreCompleto: true, telefono: true, score: true } },
      branch:   { select: { id: true, nombre: true } },
      cobrador: { select: { id: true, nombre: true } },
      loanGroup:{ select: { nombre: true } },
      schedule: { select: { estado: true } },
      loanRenovado: {
        where:  { estado: { in: ['PENDING_REVIEW', 'RETURNED_TO_COORDINATOR', 'PENDING_APPROVAL', 'APPROVED', 'IN_ACTIVATION', 'ACTIVE'] } },
        select: { id: true },
      },
    },
  })

  type RenovRow = {
    loanId:         string
    tipo:           string
    cliente:        string
    telefono:       string | null
    score:          number
    clientId:       string
    branchId:       string
    branchNombre:   string
    cobradorId:     string
    cobradorNombre: string
    grupoNombre:    string | null
    capital:        number
    pagados:        number
    umbral:         number
    excedente:      number
  }

  const renovaciones: RenovRow[] = []
  for (const l of loansActivos) {
    if (l.loanRenovado.length > 0) continue
    const umbral = UMBRAL_POR_TIPO[l.tipo]
    if (!umbral) continue
    const pagados = l.schedule.filter((s) => s.estado === 'PAID' || s.estado === 'ADVANCE' || s.estado === 'FINANCIADO').length
    if (pagados < umbral) continue
    renovaciones.push({
      loanId:         l.id,
      tipo:           l.tipo,
      cliente:        l.client.nombreCompleto,
      telefono:       l.client.telefono,
      score:          l.client.score,
      clientId:       l.client.id,
      branchId:       l.branch.id,
      branchNombre:   l.branch.nombre,
      cobradorId:     l.cobrador.id,
      cobradorNombre: l.cobrador.nombre,
      grupoNombre:    l.loanGroup?.nombre ?? null,
      capital:        Number(l.capital),
      pagados,
      umbral,
      excedente:      pagados - umbral,
    })
  }
  const renovacionesPorSucursal = agrupar(renovaciones)
  for (const suc of renovacionesPorSucursal) {
    for (const c of suc.coords) {
      c.rows.sort((a, b) => b.score - a.score || b.excedente - a.excedente)
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // REACTIVACIÓN — LIQUIDATED en últimos 60 días sin crédito vivo
  // ───────────────────────────────────────────────────────────────────
  const loansLiquidadosRecientes = await prisma.loan.findMany({
    where: {
      companyId,
      estado:    'LIQUIDATED',
      updatedAt: { gte: hace60Dias },
      AND:       [loanNotDeletedWhere],
    },
    select: {
      id: true, tipo: true, capital: true, updatedAt: true,
      client: {
        select: {
          id: true, nombreCompleto: true, telefono: true, score: true,
          loans: {
            where: {
              companyId,
              estado: { in: ['PENDING_REVIEW', 'RETURNED_TO_COORDINATOR', 'PENDING_APPROVAL', 'APPROVED', 'IN_ACTIVATION', 'ACTIVE', 'DEFAULTED'] },
              AND:    [loanNotDeletedWhere],
            },
            select: { id: true },
          },
        },
      },
      branch:   { select: { id: true, nombre: true } },
      cobrador: { select: { id: true, nombre: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  type ReactivRow = {
    loanId:         string
    tipo:           string
    cliente:        string
    telefono:       string | null
    score:          number
    clientId:       string
    branchId:       string
    branchNombre:   string
    cobradorId:     string
    cobradorNombre: string
    capital:        number
    liquidadoAt:    Date
    diasSin:        number
  }

  const reactivacionesPorCliente = new Map<string, ReactivRow>()
  for (const l of loansLiquidadosRecientes) {
    if (l.client.loans.length > 0) continue
    const dias = Math.floor((hoy.getTime() - l.updatedAt.getTime()) / (24 * 60 * 60 * 1000))
    const row: ReactivRow = {
      loanId:         l.id,
      tipo:           l.tipo,
      cliente:        l.client.nombreCompleto,
      telefono:       l.client.telefono,
      score:          l.client.score,
      clientId:       l.client.id,
      branchId:       l.branch.id,
      branchNombre:   l.branch.nombre,
      cobradorId:     l.cobrador.id,
      cobradorNombre: l.cobrador.nombre,
      capital:        Number(l.capital),
      liquidadoAt:    l.updatedAt,
      diasSin:        dias,
    }
    const ya = reactivacionesPorCliente.get(l.client.id)
    if (!ya || row.diasSin < ya.diasSin) reactivacionesPorCliente.set(l.client.id, row)
  }
  const reactivaciones = Array.from(reactivacionesPorCliente.values())
  const reactivacionesPorSucursal = agrupar(reactivaciones)
  for (const suc of reactivacionesPorSucursal) {
    for (const c of suc.coords) {
      c.rows.sort((a, b) => b.score - a.score || a.diasSin - b.diasSin)
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // UI
  // ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-8 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Zap className="h-6 w-6 text-primary-400" />
          Renovaciones
        </h1>
        <p className="text-sm text-muted-foreground">
          Agrupado por sucursal y coordinador. Umbral renovación anticipada: Individual ≥ 10 pagos · Solidario ≥ 7 · Ágil ≥ 20 · Fiduciario no aplica.
        </p>
      </div>

      {/* Resumen tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl p-2 bg-emerald-500/15">
              <Sparkles className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Renovación anticipada</p>
              <p className="text-2xl font-bold">
                {renovaciones.length}
                <span className="text-xs text-muted-foreground font-normal ml-2">
                  en {renovacionesPorSucursal.length} sucursal{renovacionesPorSucursal.length === 1 ? '' : 'es'}
                </span>
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl p-2 bg-amber-500/15">
              <RefreshCcw className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Reactivación (últimos 60 d)</p>
              <p className="text-2xl font-bold">
                {reactivaciones.length}
                <span className="text-xs text-muted-foreground font-normal ml-2">
                  en {reactivacionesPorSucursal.length} sucursal{reactivacionesPorSucursal.length === 1 ? '' : 'es'}
                </span>
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* ═══ RENOVACIÓN ANTICIPADA ═══ */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 border-b border-border/50 pb-2">
          <Sparkles className="h-5 w-5 text-emerald-400" />
          <h2 className="text-base font-bold">Renovación anticipada</h2>
          <span className="text-xs text-muted-foreground">({renovaciones.length})</span>
        </div>
        {renovacionesPorSucursal.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Ningún crédito activo ha cumplido el umbral para renovación anticipada.
          </Card>
        ) : (
          <div className="space-y-4">
            {renovacionesPorSucursal.map((suc) => (
              <Card key={suc.branchId} className="p-4 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-semibold">{suc.branchNombre}</h3>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {suc.totalRows} candidato{suc.totalRows === 1 ? '' : 's'} · {suc.coords.length} coord
                  </span>
                </div>
                {suc.coords.map((cob) => (
                  <details key={cob.cobradorId} open className="rounded-md border border-border/40">
                    <summary className="cursor-pointer select-none px-3 py-2 text-xs flex items-center justify-between hover:bg-muted/20">
                      <span className="flex items-center gap-2">
                        <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">{cob.cobradorNombre}</span>
                        <span className="text-muted-foreground">({cob.rows.length})</span>
                      </span>
                    </summary>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/20 text-[11px] uppercase text-muted-foreground">
                          <tr>
                            <th className="text-left px-3 py-1.5 font-medium">Cliente</th>
                            <th className="text-left px-3 py-1.5 font-medium">Score</th>
                            <th className="text-left px-3 py-1.5 font-medium">Tipo</th>
                            <th className="text-right px-3 py-1.5 font-medium">Capital</th>
                            <th className="text-center px-3 py-1.5 font-medium">Pagos</th>
                            <th className="text-left px-3 py-1.5 font-medium">Teléfono</th>
                            <th className="px-3 py-1.5 w-24" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30">
                          {cob.rows.map((r) => (
                            <tr key={r.loanId} className="hover:bg-muted/20">
                              <td className="px-3 py-1.5">
                                <div className="font-medium">{r.cliente}</div>
                                {r.grupoNombre && (
                                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                                    <Users className="h-3 w-3" /> {r.grupoNombre}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-1.5">
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${scoreBadge(r.score)}`}>
                                  {r.score}
                                </span>
                              </td>
                              <td className="px-3 py-1.5 text-xs">{LABEL_TIPO[r.tipo] ?? r.tipo}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{formatMoney(r.capital)}</td>
                              <td className="px-3 py-1.5 text-center">
                                <span className="font-semibold tabular-nums">{r.pagados}</span>
                                <span className="text-muted-foreground"> / {r.umbral}</span>
                                {r.excedente > 0 && (
                                  <span className="text-emerald-400 text-[10px] ml-1">+{r.excedente}</span>
                                )}
                              </td>
                              <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.telefono ?? '—'}</td>
                              <td className="px-3 py-1.5 text-right">
                                <Link href={`/clientes/${r.clientId}`} className="text-primary-400 hover:underline text-xs">
                                  Ver ficha →
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                ))}
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ═══ REACTIVACIÓN ═══ */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 border-b border-border/50 pb-2">
          <RefreshCcw className="h-5 w-5 text-amber-400" />
          <h2 className="text-base font-bold">Reactivación</h2>
          <span className="text-xs text-muted-foreground">
            ({reactivaciones.length}) · Clientes con crédito liquidado en los últimos 60 días sin crédito activo
          </span>
        </div>
        {reactivacionesPorSucursal.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Ningún cliente con crédito liquidado en los últimos 60 días sin crédito activo.
          </Card>
        ) : (
          <div className="space-y-4">
            {reactivacionesPorSucursal.map((suc) => (
              <Card key={suc.branchId} className="p-4 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-semibold">{suc.branchNombre}</h3>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {suc.totalRows} candidato{suc.totalRows === 1 ? '' : 's'} · {suc.coords.length} coord
                  </span>
                </div>
                {suc.coords.map((cob) => (
                  <details key={cob.cobradorId} open className="rounded-md border border-border/40">
                    <summary className="cursor-pointer select-none px-3 py-2 text-xs flex items-center justify-between hover:bg-muted/20">
                      <span className="flex items-center gap-2">
                        <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">{cob.cobradorNombre}</span>
                        <span className="text-muted-foreground">({cob.rows.length})</span>
                      </span>
                    </summary>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/20 text-[11px] uppercase text-muted-foreground">
                          <tr>
                            <th className="text-left px-3 py-1.5 font-medium">Cliente</th>
                            <th className="text-left px-3 py-1.5 font-medium">Score</th>
                            <th className="text-left px-3 py-1.5 font-medium">Último tipo</th>
                            <th className="text-right px-3 py-1.5 font-medium">Últ. capital</th>
                            <th className="text-left px-3 py-1.5 font-medium">Liquidado</th>
                            <th className="text-right px-3 py-1.5 font-medium">Días sin crédito</th>
                            <th className="text-left px-3 py-1.5 font-medium">Teléfono</th>
                            <th className="px-3 py-1.5 w-24" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30">
                          {cob.rows.map((r) => (
                            <tr key={r.clientId} className="hover:bg-muted/20">
                              <td className="px-3 py-1.5 font-medium">{r.cliente}</td>
                              <td className="px-3 py-1.5">
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${scoreBadge(r.score)}`}>
                                  {r.score}
                                </span>
                              </td>
                              <td className="px-3 py-1.5 text-xs">{LABEL_TIPO[r.tipo] ?? r.tipo}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{formatMoney(r.capital)}</td>
                              <td className="px-3 py-1.5 text-xs text-muted-foreground">{formatDate(r.liquidadoAt)}</td>
                              <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${diasSinColor(r.diasSin)}`}>
                                {r.diasSin} d
                              </td>
                              <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.telefono ?? '—'}</td>
                              <td className="px-3 py-1.5 text-right">
                                <Link href={`/clientes/${r.clientId}`} className="text-primary-400 hover:underline text-xs">
                                  Ver ficha →
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                ))}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
