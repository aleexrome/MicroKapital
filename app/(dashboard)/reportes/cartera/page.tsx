export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, DollarSign, Users, Layers } from 'lucide-react'
import { formatMoney } from '@/lib/utils'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { FiltrosBar } from '@/components/reportes/FiltrosBar'
import { parseFiltrosFromSearchParams } from '@/lib/reportes/filterParse'
import { ReportBarChart, ReportPieChart } from '@/components/reportes/Charts'
import { ImprimirReporteButton, type SeccionReporte } from '@/components/reportes/ImprimirReporteButton'
import { getCarteraSnapshot, getFiltrosOpciones } from '@/lib/reportes/queries'

const ALLOWED_ROLES = [
  'DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'GERENTE_ZONAL', 'GERENTE',
  'COORDINADOR', 'COBRADOR',
] as const

const TIPO_LABEL: Record<string, string> = {
  SOLIDARIO: 'Solidario', INDIVIDUAL: 'Individual', AGIL: 'Ágil', FIDUCIARIO: 'Fiduciario',
}

export default async function CarteraReportePage({
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

  const { filtros } = parseFiltrosFromSearchParams(searchParams)
  const [snapshot, opciones, empresa] = await Promise.all([
    getCarteraSnapshot(accessUser, companyId!, filtros),
    getFiltrosOpciones(accessUser, companyId!),
    prisma.company.findUnique({ where: { id: companyId! }, select: { nombre: true } }),
  ])

  // Datos para gráficas
  const dataPorTipo = snapshot.porTipo.map((t) => ({
    name: TIPO_LABEL[t.tipo] ?? t.tipo,
    value: t.capital,
  }))
  const dataPorSucursal = snapshot.porSucursal.slice(0, 10).map((s) => ({
    nombre: s.nombre,
    capital: s.capital,
  }))
  const dataPorCobrador = snapshot.porCobrador.slice(0, 10).map((c) => ({
    nombre: c.nombre,
    capital: c.capital,
  }))

  // Datos para imprimir
  const seccionesPrint: SeccionReporte[] = [
    {
      tipo: 'metricas',
      titulo: 'Resumen',
      items: [
        { label: 'Capital activo', valor: formatMoney(snapshot.totalCapital) },
        { label: 'Saldo teórico (capital + interés)', valor: formatMoney(snapshot.totalSaldoTeorico) },
        { label: 'Créditos activos', valor: snapshot.numCreditos.toLocaleString('es-MX') },
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
      footer: ['Total', snapshot.numCreditos, formatMoney(snapshot.totalCapital)],
    },
    {
      tipo: 'tabla',
      titulo: 'Por sucursal',
      headers: ['Sucursal', 'Créditos', 'Capital'],
      rightAlign: [1, 2],
      rows: snapshot.porSucursal.map((s) => [
        s.nombre, s.numCreditos, formatMoney(s.capital),
      ]),
    },
    {
      tipo: 'tabla',
      titulo: 'Por cobrador',
      headers: ['Cobrador', 'Créditos', 'Capital'],
      rightAlign: [1, 2],
      rows: snapshot.porCobrador.map((c) => [
        c.nombre, c.numCreditos, formatMoney(c.capital),
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
            <h1 className="text-2xl font-bold text-foreground">Cartera activa</h1>
            <p className="text-muted-foreground text-sm">
              Capital total de créditos en estado ACTIVO al momento.
            </p>
          </div>
        </div>
        <ImprimirReporteButton
          data={{
            titulo: 'Cartera activa',
            empresa: empresa?.nombre ?? 'MicroKapital',
            filtros: [
              { label: 'Generado al', valor: new Date().toLocaleString('es-MX') },
            ],
            secciones: seccionesPrint,
          }}
          landscape
        />
      </div>

      <FiltrosBar branches={opciones.branches} cobradores={opciones.cobradores} hidePeriodo />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          title="Capital activo"
          value={formatMoney(snapshot.totalCapital)}
          icon={DollarSign}
          color="blue"
        />
        <MetricCard
          title="Saldo teórico"
          value={formatMoney(snapshot.totalSaldoTeorico)}
          icon={Layers}
          color="purple"
        />
        <MetricCard
          title="Créditos activos"
          value={snapshot.numCreditos.toLocaleString('es-MX')}
          icon={Users}
          color="green"
        />
      </div>

      {snapshot.numCreditos === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          Sin cartera activa con los filtros actuales.
        </CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Por producto</CardTitle></CardHeader>
              <CardContent>
                <ReportPieChart
                  data={dataPorTipo}
                  formatter="money"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Top 10 sucursales</CardTitle></CardHeader>
              <CardContent>
                <ReportBarChart
                  data={dataPorSucursal}
                  xKey="nombre"
                  series={[{ dataKey: 'capital', name: 'Capital', color: '#7B6FFF' }]}
                  formatter="money"
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Top 10 cobradores</CardTitle></CardHeader>
            <CardContent>
              <ReportBarChart
                data={dataPorCobrador}
                xKey="nombre"
                series={[{ dataKey: 'capital', name: 'Capital', color: '#22d3ee' }]}
                formatter="money"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Detalle por sucursal</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 text-muted-foreground text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-2.5">Sucursal</th>
                    <th className="text-right px-4 py-2.5">Créditos</th>
                    <th className="text-right px-4 py-2.5">Capital</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {snapshot.porSucursal.map((s) => (
                    <tr key={s.branchId} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-2.5 font-medium">{s.nombre}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{s.numCreditos}</td>
                      <td className="px-4 py-2.5 text-right money tabular-nums">{formatMoney(s.capital)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-primary-500/10 border-t-2 border-primary-500/30">
                  <tr>
                    <td className="px-4 py-2.5 font-semibold">Total</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{snapshot.numCreditos}</td>
                    <td className="px-4 py-2.5 text-right font-bold money tabular-nums text-primary-300">
                      {formatMoney(snapshot.totalCapital)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
