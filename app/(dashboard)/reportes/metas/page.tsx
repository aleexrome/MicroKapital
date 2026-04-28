export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Plus, Pencil, Target, Building2, User as UserIcon, Layers } from 'lucide-react'
import { formatMoney, formatDate } from '@/lib/utils'
import { MetaDeleteButton } from '@/components/reportes/MetaDeleteButton'

const ROLES_VEN = ['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'GERENTE_ZONAL'] as const
const ROLES_DEFINEN = ['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL']

const TIPO_LABEL: Record<string, string> = {
  SOLIDARIO: 'Solidario', INDIVIDUAL: 'Individual', AGIL: 'Ágil', FIDUCIARIO: 'Fiduciario',
}

export default async function MetasPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  const { rol, companyId } = session.user
  if (!ROLES_VEN.includes(rol as typeof ROLES_VEN[number])) redirect('/reportes')

  const puedeDefinir = ROLES_DEFINEN.includes(rol)

  const goals = await prisma.goal.findMany({
    where: { companyId: companyId! },
    orderBy: [{ semanaInicio: 'desc' }, { branchId: 'asc' }, { cobradorId: 'asc' }],
  })

  // Resolver nombres de branch / cobrador
  const branchIds = goals.map((g) => g.branchId).filter(Boolean) as string[]
  const cobradorIds = goals.map((g) => g.cobradorId).filter(Boolean) as string[]
  const [branches, cobradores] = await Promise.all([
    prisma.branch.findMany({
      where: { id: { in: branchIds }, companyId: companyId! },
      select: { id: true, nombre: true },
    }),
    prisma.user.findMany({
      where: { id: { in: cobradorIds }, companyId: companyId! },
      select: { id: true, nombre: true },
    }),
  ])
  const branchMap = new Map(branches.map((b) => [b.id, b.nombre]))
  const cobradorMap = new Map(cobradores.map((c) => [c.id, c.nombre]))

  // Agrupar por semana
  const porSemana = new Map<string, typeof goals>()
  for (const g of goals) {
    const k = g.semanaInicio.toISOString().slice(0, 10)
    if (!porSemana.has(k)) porSemana.set(k, [])
    porSemana.get(k)!.push(g)
  }
  const semanas = Array.from(porSemana.entries())

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link href="/reportes" className="rounded-xl p-2 hover:bg-secondary transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Metas semanales</h1>
            <p className="text-muted-foreground text-sm">
              Definidas por dirección. Se evalúan en /reportes/cumplimiento.
            </p>
          </div>
        </div>
        {puedeDefinir && (
          <Link
            href="/reportes/metas/nueva"
            className="inline-flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-400 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nueva meta
          </Link>
        )}
      </div>

      {goals.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <Target className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <h2 className="text-lg font-semibold">Aún no hay metas definidas</h2>
            <p className="text-sm text-muted-foreground">
              {puedeDefinir
                ? 'Crea la primera meta semanal para empezar a medir el cumplimiento.'
                : 'La dirección aún no ha definido metas.'}
            </p>
            {puedeDefinir && (
              <Link
                href="/reportes/metas/nueva"
                className="inline-flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-400 transition-colors mt-3"
              >
                <Plus className="h-4 w-4" />
                Definir meta
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        semanas.map(([k, list]) => (
          <Card key={k}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <span>Semana del {formatDate(list[0].semanaInicio)} al {formatDate(list[0].semanaFin)}</span>
                <Badge variant="secondary" className="text-[10px]">{list.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/40 text-muted-foreground text-xs uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-4 py-2.5">Alcance</th>
                      <th className="text-right px-4 py-2.5">Capital</th>
                      <th className="text-right px-4 py-2.5">Créditos</th>
                      <th className="text-right px-4 py-2.5">Cob. esperada</th>
                      <th className="text-right px-4 py-2.5">Cob. efectiva</th>
                      <th className="text-right px-4 py-2.5">Mora máx</th>
                      <th className="text-right px-4 py-2.5">Crecimiento</th>
                      {puedeDefinir && <th className="text-right px-4 py-2.5">Acciones</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {list.map((g) => {
                      const scopeIcons: React.ReactNode[] = []
                      const scopeLabels: string[] = []
                      if (g.cobradorId) {
                        scopeIcons.push(<UserIcon key="u" className="h-3.5 w-3.5 text-primary-300" />)
                        scopeLabels.push(cobradorMap.get(g.cobradorId) ?? '—')
                      }
                      if (g.branchId) {
                        scopeIcons.push(<Building2 key="b" className="h-3.5 w-3.5 text-primary-300" />)
                        scopeLabels.push(branchMap.get(g.branchId) ?? '—')
                      }
                      if (g.loanType) {
                        scopeIcons.push(<Layers key="l" className="h-3.5 w-3.5 text-primary-300" />)
                        scopeLabels.push(TIPO_LABEL[g.loanType])
                      }
                      const scope = scopeLabels.length === 0
                        ? <span className="flex items-center gap-1.5"><Target className="h-3.5 w-3.5 text-primary-300" /> Empresa global</span>
                        : <span className="flex items-center gap-1.5">{scopeIcons}<span>{scopeLabels.join(' · ')}</span></span>

                      return (
                        <tr key={g.id} className="hover:bg-secondary/30">
                          <td className="px-4 py-2.5">{scope}</td>
                          <td className="px-4 py-2.5 text-right money tabular-nums">
                            {g.metaCapitalColocado != null ? formatMoney(Number(g.metaCapitalColocado)) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {g.metaCreditosColocados ?? '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right money tabular-nums">
                            {g.metaCobranzaEsperada != null ? formatMoney(Number(g.metaCobranzaEsperada)) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right money tabular-nums">
                            {g.metaCobranzaEfectiva != null ? formatMoney(Number(g.metaCobranzaEfectiva)) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {g.metaMoraMaxima != null ? `${Number(g.metaMoraMaxima).toFixed(1)}%` : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {g.metaCrecimiento != null ? `${Number(g.metaCrecimiento).toFixed(1)}%` : '—'}
                          </td>
                          {puedeDefinir && (
                            <td className="px-4 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Link href={`/reportes/metas/${g.id}/editar`}>
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                </Link>
                                <MetaDeleteButton
                                  goalId={g.id}
                                  label={scopeLabels.join(' · ') || 'meta global'}
                                />
                              </div>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}
