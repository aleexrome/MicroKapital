export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { weekRange, formatSemanaTitle } from '@/lib/reportes/dateRanges'
import { evaluarCumplimientoSemanal } from '@/lib/reportes/cumplimiento'
import { CumplimientoCard, CumplimientoSummary } from '@/components/reportes/CumplimientoCard'
import { AutoRefresh } from '@/components/reportes/AutoRefresh'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, Target, Plus } from 'lucide-react'

const ALLOWED_ROLES = [
  'DIRECTOR_GENERAL',
  'DIRECTOR_COMERCIAL',
  'GERENTE_ZONAL',
  'GERENTE',
  'COORDINADOR',
  'COBRADOR',
] as const

const ADMIN_ROLES = ['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL']

export default async function CumplimientoPage({
  searchParams,
}: {
  searchParams: { semanaInicio?: string }
}) {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  const { rol, companyId } = session.user
  if (!ALLOWED_ROLES.includes(rol as typeof ALLOWED_ROLES[number])) redirect('/dashboard')

  const accessUser = {
    id: session.user.id,
    rol,
    branchId: session.user.branchId,
    zonaBranchIds: session.user.zonaBranchIds,
  }

  // Semana a evaluar (lunes ISO o esta semana)
  let ref = new Date()
  if (searchParams.semanaInicio && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.semanaInicio)) {
    const [y, m, d] = searchParams.semanaInicio.split('-').map(Number)
    ref = new Date(Date.UTC(y, m - 1, d, 12)) // medio día UTC para evitar bordes de TZ
  }
  const range = weekRange(ref)

  // Filtrar metas según rol: cobrador/coordinador solo ve las suyas o sin scope
  const goalWhere: Prisma.GoalWhereInput = {
    companyId: companyId!,
    semanaInicio: range.inicio,
  }

  if (rol === 'COORDINADOR' || rol === 'COBRADOR') {
    goalWhere.OR = [
      { branchId: null, cobradorId: null },
      ...(session.user.branchId ? [{ branchId: session.user.branchId, cobradorId: null }] : []),
      { branchId: null, cobradorId: session.user.id },
    ]
  } else if (rol === 'GERENTE_ZONAL' || rol === 'GERENTE') {
    const branchIds = session.user.zonaBranchIds?.length
      ? session.user.zonaBranchIds
      : session.user.branchId ? [session.user.branchId] : []
    if (branchIds.length) {
      goalWhere.OR = [
        { branchId: null },
        { branchId: { in: branchIds } },
      ]
    }
  }

  const goals = await prisma.goal.findMany({
    where: goalWhere,
    orderBy: [{ branchId: 'asc' }, { cobradorId: 'asc' }],
  })
  const cumplimientos = await evaluarCumplimientoSemanal(accessUser, companyId!, goals, range)

  const puedeDefinirMetas = ADMIN_ROLES.includes(rol)

  // Navegación de semanas
  const lunesIso = (d: Date) => d.toISOString().slice(0, 10)
  const semanaAnterior = new Date(range.inicio); semanaAnterior.setDate(semanaAnterior.getDate() - 7)
  const semanaSiguiente = new Date(range.inicio); semanaSiguiente.setDate(semanaSiguiente.getDate() + 7)

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link href="/reportes" className="rounded-xl p-2 hover:bg-secondary transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Cumplimiento de metas</h1>
            <p className="text-muted-foreground text-sm">{formatSemanaTitle(range)}</p>
          </div>
        </div>
        <AutoRefresh intervalMs={60_000} />
      </div>

      {/* Navegación de semanas */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          href={`/reportes/cumplimiento?semanaInicio=${lunesIso(semanaAnterior)}`}
          className="rounded-lg border border-border/60 bg-card px-3 py-1.5 hover:bg-secondary transition-colors"
        >
          ← Semana anterior
        </Link>
        <Link
          href="/reportes/cumplimiento"
          className="rounded-lg border border-border/60 bg-card px-3 py-1.5 hover:bg-secondary transition-colors"
        >
          Esta semana
        </Link>
        <Link
          href={`/reportes/cumplimiento?semanaInicio=${lunesIso(semanaSiguiente)}`}
          className="rounded-lg border border-border/60 bg-card px-3 py-1.5 hover:bg-secondary transition-colors"
        >
          Semana siguiente →
        </Link>
      </div>

      {cumplimientos.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <Target className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <h2 className="text-lg font-semibold">Sin metas para esta semana</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {puedeDefinirMetas
                ? 'Define metas semanales para visualizar el cumplimiento en tiempo real.'
                : 'La dirección aún no ha definido metas para esta semana.'}
            </p>
            {puedeDefinirMetas && (
              <Link
                href={`/reportes/metas/nueva?semanaInicio=${lunesIso(range.inicio)}`}
                className="inline-flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-400 transition-colors mt-3"
              >
                <Plus className="h-4 w-4" />
                Definir meta
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <CumplimientoSummary items={cumplimientos} />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {cumplimientos.map((c) => (
              <CumplimientoCard key={c.goal.id} cumplimiento={c} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
