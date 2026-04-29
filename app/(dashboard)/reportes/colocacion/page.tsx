export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, TrendingUp, FileText } from 'lucide-react'
import { formatMoney } from '@/lib/utils'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { FiltrosBar } from '@/components/reportes/FiltrosBar'
import { parseFiltrosFromSearchParams } from '@/lib/reportes/filterParse'
import { ReportBarChart, ReportPieChart } from '@/components/reportes/Charts'
import { ImprimirReporteButton, type SeccionReporte } from '@/components/reportes/ImprimirReporteButton'
import { getColocacionSnapshot, getFiltrosOpciones } from '@/lib/reportes/queries'
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

export default async function ColocacionReportePage({
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
    getColocacionSnapshot(accessUser, companyId!, range, filtros),
    getFiltrosOpciones(accessUser, companyId!),
    prisma.company.findUnique({ where: { id: companyId! }, select: { nombre: true } }),
  ])

  const dataPorTipo = snapshot.porTipo.map((t) => ({
    name: TIPO_LABEL[t.tipo] ?? t.tipo,
    value: t.capital,
  })).filter((x) => x.value > 0)

  const dataPorSucursal = snapshot.porSucursal.slice(0, 10).map((s) => ({
    nombre: s.nombre,
    capital: s.capital,
  }))

  const seccionesPrint: SeccionReporte[] = [
    {
      tipo: 'metricas',
      titulo: 'Resumen del periodo',
      items: [
        { label: 'Capital colocado', valor: formatMoney(snapshot.totalCapital) },
        { label: 'Créditos colocados', valor: snapshot.numCreditos.toLocaleString('es-MX') },
        { label: 'Promedio por crédito', valor: snapshot.numCreditos > 0
            ? formatMoney(snapshot.totalCapital / snapshot.numCreditos)
            : formatMoney(0) },
      ],
    },
    {
      tipo: 'tabla',
      titulo: 'Por producto',
      headers: ['Producto', 'Créditos', 'Capital'],
      rightAlign: [1, 2],
      rows: snapshot.porTipo.map((t) => [
        TIPO_LABEL[t.tipo] ?? t.tipo,
        t.numCreditos,
        formatMoney(t.capital),
      ]),
    },
    {
      tipo: 'tabla',
      titulo: 'Por sucursal',
      headers: ['Sucursal', 'Créditos', 'Capital'],
      rightAlign: [1, 2],
      rows: snapshot.porSucursal.map((s) => [s.nombre, s.numCreditos, formatMoney(s.capital)]),
    },
    {
      tipo: 'tabla',
      titulo: 'Por cobrador',
      headers: ['Cobrador', 'Créditos', 'Capital'],
      rightAlign: [1, 2],
      rows: snapshot.porCobrador.map((c) => [c.nombre, c.numCreditos, formatMoney(c.capital)]),
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
            <h1 className="text-2xl font-bold text-foreground">Colocación</h1>
            <p className="text-muted-foreground text-sm">
              Créditos desembolsados en {PERIODO_LABEL[periodo].toLowerCase()} · {formatRangeShort(range)}
            </p>
          </div>
        </div>
        <ImprimirReporteButton
          data={{
            titulo: 'Reporte de colocación',
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
          title="Capital colocado"
          value={formatMoney(snapshot.totalCapital)}
          icon={TrendingUp}
          color="green"
        />
        <MetricCard
          title="Créditos colocados"
          value={snapshot.numCreditos.toLocaleString('es-MX')}
          icon={FileText}
          color="blue"
        />
        <MetricCard
          title="Promedio por crédito"
          value={snapshot.numCreditos > 0
            ? formatMoney(snapshot.totalCapital / snapshot.numCreditos)
            : formatMoney(0)}
          icon={TrendingUp}
          color="purple"
        />
      </div>

      {snapshot.numCreditos === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          Sin colocación en el periodo seleccionado.
        </CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Por producto</CardTitle></CardHeader>
              <CardContent>
                <ReportPieChart data={dataPorTipo} formatter="money" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Top 10 sucursales</CardTitle></CardHeader>
              <CardContent>
                <ReportBarChart
                  data={dataPorSucursal}
                  xKey="nombre"
                  series={[{ dataKey: 'capital', name: 'Capital', color: '#34d399' }]}
                  formatter="money"
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Detalle por cobrador</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 text-muted-foreground text-xs uppercase tracking-wide sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2.5">Cobrador</th>
                    <th className="text-right px-4 py-2.5">Créditos</th>
                    <th className="text-right px-4 py-2.5">Capital</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {snapshot.porCobrador.map((c) => (
                    <tr key={c.cobradorId} className="hover:bg-secondary/30">
                      <td className="px-4 py-2 font-medium">{c.nombre}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{c.numCreditos}</td>
                      <td className="px-4 py-2 text-right money tabular-nums">{formatMoney(c.capital)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
