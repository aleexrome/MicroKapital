export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { formatMoney, formatDate } from '@/lib/utils'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { FiltrosBar } from '@/components/reportes/FiltrosBar'
import { parseFiltrosFromSearchParams } from '@/lib/reportes/filterParse'
import { ReportPieChart } from '@/components/reportes/Charts'
import { ImprimirReporteButton, type SeccionReporte } from '@/components/reportes/ImprimirReporteButton'
import { getLiquidacionesSnapshot, getFiltrosOpciones } from '@/lib/reportes/queries'
import { rangeFromPreset, formatRangeShort } from '@/lib/reportes/dateRanges'

const ALLOWED_ROLES = [
  'DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'GERENTE_ZONAL', 'GERENTE',
  'COORDINADOR', 'COBRADOR',
] as const

const TIPO_LABEL: Record<string, string> = {
  SOLIDARIO: 'Solidario', INDIVIDUAL: 'Individual', AGIL: 'Ágil', FIDUCIARIO: 'Fiduciario',
}

const PERIODO_LABEL: Record<string, string> = {
  hoy: 'Hoy', semana: 'Esta semana', semanaAnterior: 'Semana anterior',
  mes: 'Este mes', mesAnterior: 'Mes anterior', trimestre: 'Trimestre', año: 'Año',
}

export default async function LiquidacionesReportePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
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

  const { periodo, filtros } = parseFiltrosFromSearchParams(searchParams)
  const range = rangeFromPreset(periodo)

  const [snapshot, opciones, empresa] = await Promise.all([
    getLiquidacionesSnapshot(accessUser, companyId!, range, filtros),
    getFiltrosOpciones(accessUser, companyId!),
    prisma.company.findUnique({ where: { id: companyId! }, select: { nombre: true } }),
  ])

  const dataPorTipo = snapshot.porTipo.map((t) => ({
    name: TIPO_LABEL[t.tipo] ?? t.tipo,
    value: t.numLiquidados,
  })).filter((x) => x.value > 0)

  // Ciclo de vida promedio en días
  const cicloDias = snapshot.ultimos.length > 0
    ? Math.round(snapshot.ultimos
        .filter((l) => l.fechaDesembolso)
        .reduce((s, l) => {
          const dias = (l.liquidadoEn.getTime() - l.fechaDesembolso!.getTime()) / 86_400_000
          return s + dias
        }, 0) / Math.max(1, snapshot.ultimos.filter((l) => l.fechaDesembolso).length))
    : 0

  const seccionesPrint: SeccionReporte[] = [
    {
      tipo: 'metricas',
      titulo: 'Resumen del periodo',
      items: [
        { label: 'Créditos liquidados', valor: snapshot.numLiquidados.toLocaleString('es-MX') },
        { label: 'Capital recuperado', valor: formatMoney(snapshot.capitalLiquidado) },
        { label: 'Ciclo de vida promedio', valor: `${cicloDias} días` },
      ],
    },
    {
      tipo: 'tabla',
      titulo: 'Por producto',
      headers: ['Producto', 'Liquidados', 'Capital'],
      rightAlign: [1, 2],
      rows: snapshot.porTipo.map((t) => [
        TIPO_LABEL[t.tipo] ?? t.tipo,
        t.numLiquidados,
        formatMoney(t.capital),
      ]),
    },
    {
      tipo: 'tabla',
      titulo: 'Últimas liquidaciones',
      headers: ['Cliente', 'Producto', 'Capital', 'Liquidado'],
      rightAlign: [2],
      rows: snapshot.ultimos.map((l) => [
        l.cliente,
        TIPO_LABEL[l.tipo] ?? l.tipo,
        formatMoney(l.capital),
        formatDate(l.liquidadoEn),
      ]),
    },
  ]

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link href="/reportes" className="rounded-xl p-2 hover:bg-secondary transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Liquidaciones</h1>
            <p className="text-muted-foreground text-sm">
              {PERIODO_LABEL[periodo]} · {formatRangeShort(range)}
            </p>
          </div>
        </div>
        <ImprimirReporteButton
          data={{
            titulo: 'Reporte de liquidaciones',
            empresa: empresa?.nombre ?? 'MicroKapital',
            subtitulo: `${PERIODO_LABEL[periodo]} · ${formatRangeShort(range)}`,
            filtros: [],
            secciones: seccionesPrint,
          }}
          landscape
        />
      </div>

      <FiltrosBar branches={opciones.branches} cobradores={opciones.cobradores} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          title="Créditos liquidados"
          value={snapshot.numLiquidados.toLocaleString('es-MX')}
          icon={CheckCircle2}
          color="purple"
        />
        <MetricCard
          title="Capital recuperado"
          value={formatMoney(snapshot.capitalLiquidado)}
          icon={CheckCircle2}
          color="green"
        />
        <MetricCard
          title="Ciclo de vida promedio"
          value={`${cicloDias} días`}
          icon={CheckCircle2}
          color="blue"
        />
      </div>

      {snapshot.numLiquidados === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          Sin liquidaciones en el periodo seleccionado.
        </CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Liquidaciones por producto</CardTitle></CardHeader>
              <CardContent>
                <ReportPieChart data={dataPorTipo} tickFormatter={(v) => v.toString()} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Últimas liquidaciones</CardTitle></CardHeader>
              <CardContent className="p-0 max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/40 text-muted-foreground text-xs uppercase tracking-wide sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2.5">Cliente</th>
                      <th className="text-right px-4 py-2.5">Capital</th>
                      <th className="text-right px-4 py-2.5">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {snapshot.ultimos.map((l) => (
                      <tr key={l.id} className="hover:bg-secondary/30">
                        <td className="px-4 py-2 font-medium truncate max-w-[200px]">{l.cliente}</td>
                        <td className="px-4 py-2 text-right money tabular-nums">{formatMoney(l.capital)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                          {formatDate(l.liquidadoEn)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
