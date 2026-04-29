export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, AlertTriangle, Users } from 'lucide-react'
import { formatMoney } from '@/lib/utils'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { FiltrosBar } from '@/components/reportes/FiltrosBar'
import { parseFiltrosFromSearchParams } from '@/lib/reportes/filterParse'
import { ReportBarChart, ReportPieChart } from '@/components/reportes/Charts'
import { ImprimirReporteButton, type SeccionReporte } from '@/components/reportes/ImprimirReporteButton'
import { getMoraSnapshot, getFiltrosOpciones } from '@/lib/reportes/queries'

const ALLOWED_ROLES = [
  'DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'GERENTE_ZONAL', 'GERENTE',
  'COORDINADOR', 'COBRADOR',
] as const

const BUCKET_COLORS: Record<string, string> = {
  '1-7':  '#fbbf24',
  '8-15': '#f97316',
  '16+':  '#f43f5e',
}

export default async function MoraReportePage({
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
    getMoraSnapshot(accessUser, companyId!, filtros),
    getFiltrosOpciones(accessUser, companyId!),
    prisma.company.findUnique({ where: { id: companyId! }, select: { nombre: true } }),
  ])

  const dataBuckets = snapshot.buckets.map((b) => ({
    name: `${b.rango} días`,
    value: b.monto,
    color: BUCKET_COLORS[b.rango],
  })).filter((x) => x.value > 0)

  const dataPorSucursal = snapshot.porSucursal.slice(0, 10).map((s) => ({
    nombre: s.nombre,
    monto: s.monto,
  }))

  const seccionesPrint: SeccionReporte[] = [
    {
      tipo: 'metricas',
      titulo: 'Resumen',
      items: [
        { label: 'Mora total', valor: formatMoney(snapshot.total) },
        { label: 'Pagos en mora', valor: snapshot.numSchedules.toLocaleString('es-MX') },
        { label: 'Clientes en mora', valor: snapshot.numClientes.toLocaleString('es-MX') },
      ],
    },
    {
      tipo: 'tabla',
      titulo: 'Por edad de mora',
      headers: ['Rango', 'Pagos', 'Monto'],
      rightAlign: [1, 2],
      rows: snapshot.buckets.map((b) => [`${b.rango} días`, b.count, formatMoney(b.monto)]),
      footer: ['Total', snapshot.numSchedules, formatMoney(snapshot.total)],
    },
    {
      tipo: 'tabla',
      titulo: 'Por sucursal',
      headers: ['Sucursal', 'Pagos', 'Mora'],
      rightAlign: [1, 2],
      rows: snapshot.porSucursal.map((s) => [s.nombre, s.count, formatMoney(s.monto)]),
    },
    {
      tipo: 'tabla',
      titulo: 'Por cobrador',
      headers: ['Cobrador', 'Pagos', 'Mora'],
      rightAlign: [1, 2],
      rows: snapshot.porCobrador.map((c) => [c.nombre, c.count, formatMoney(c.monto)]),
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
            <h1 className="text-2xl font-bold text-foreground">Mora</h1>
            <p className="text-muted-foreground text-sm">
              Cartera vencida hasta hoy. Buckets por edad: 1-7, 8-15, 16+ días.
            </p>
          </div>
        </div>
        <ImprimirReporteButton
          data={{
            titulo: 'Reporte de mora',
            empresa: empresa?.nombre ?? 'MicroKapital',
            subtitulo: `Corte: ${new Date().toLocaleDateString('es-MX')}`,
            filtros: [],
            secciones: seccionesPrint,
          }}
          landscape
        />
      </div>

      <FiltrosBar branches={opciones.branches} cobradores={opciones.cobradores} hidePeriodo />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          title="Mora total"
          value={formatMoney(snapshot.total)}
          icon={AlertTriangle}
          color="red"
        />
        <MetricCard
          title="Pagos vencidos"
          value={snapshot.numSchedules.toLocaleString('es-MX')}
          icon={AlertTriangle}
          color="yellow"
        />
        <MetricCard
          title="Clientes en mora"
          value={snapshot.numClientes.toLocaleString('es-MX')}
          icon={Users}
          color="purple"
        />
      </div>

      {snapshot.numSchedules === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          Sin mora registrada con los filtros actuales.
        </CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Mora por edad</CardTitle></CardHeader>
              <CardContent>
                <ReportPieChart data={dataBuckets} formatter="money" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Top 10 sucursales con mora</CardTitle></CardHeader>
              <CardContent>
                <ReportBarChart
                  data={dataPorSucursal}
                  xKey="nombre"
                  series={[{ dataKey: 'monto', name: 'Mora', color: '#f43f5e' }]}
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
                    <th className="text-right px-4 py-2.5">Pagos</th>
                    <th className="text-right px-4 py-2.5">Mora</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {snapshot.porCobrador.map((c) => (
                    <tr key={c.cobradorId} className="hover:bg-secondary/30">
                      <td className="px-4 py-2 font-medium truncate">{c.nombre}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{c.count}</td>
                      <td className="px-4 py-2 text-right money tabular-nums text-rose-400">
                        {formatMoney(c.monto)}
                      </td>
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
