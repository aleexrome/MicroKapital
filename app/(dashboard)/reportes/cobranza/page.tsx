export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Wallet, Banknote, CreditCard, ArrowLeftRight, Clock } from 'lucide-react'
import { formatMoney } from '@/lib/utils'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { FiltrosBar } from '@/components/reportes/FiltrosBar'
import { parseFiltrosFromSearchParams } from '@/lib/reportes/filterParse'
import { ReportLineChart, ReportPieChart } from '@/components/reportes/Charts'
import { ImprimirReporteButton, type SeccionReporte } from '@/components/reportes/ImprimirReporteButton'
import { AutoRefresh } from '@/components/reportes/AutoRefresh'
import { getCobranzaSnapshot, getCobranzaEsperada, getFiltrosOpciones } from '@/lib/reportes/queries'
import { rangeFromPreset, formatRangeShort } from '@/lib/reportes/dateRanges'

const ALLOWED_ROLES = [
  'DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'GERENTE_ZONAL', 'GERENTE',
  'COORDINADOR', 'COBRADOR',
] as const

const PERIODO_LABEL: Record<string, string> = {
  hoy: 'Hoy', semana: 'Esta semana', semanaAnterior: 'Semana anterior',
  mes: 'Este mes', mesAnterior: 'Mes anterior', trimestre: 'Trimestre', año: 'Año',
}

export default async function CobranzaReportePage({
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

  const [snapshot, esperada, opciones, empresa] = await Promise.all([
    getCobranzaSnapshot(accessUser, companyId!, range, filtros),
    getCobranzaEsperada(accessUser, companyId!, range, filtros),
    getFiltrosOpciones(accessUser, companyId!),
    prisma.company.findUnique({ where: { id: companyId! }, select: { nombre: true } }),
  ])

  const efectividad = esperada.total > 0 ? (snapshot.total / esperada.total) * 100 : 0

  const seccionesPrint: SeccionReporte[] = [
    {
      tipo: 'metricas',
      titulo: 'Resumen del periodo',
      items: [
        { label: 'Cobrado total', valor: formatMoney(snapshot.total) },
        { label: 'Esperado', valor: formatMoney(esperada.total), sub: `${esperada.numSchedules} pagos` },
        { label: 'Efectividad', valor: `${efectividad.toFixed(1)}%` },
        { label: 'Efectivo', valor: formatMoney(snapshot.efectivo) },
        { label: 'Tarjeta', valor: formatMoney(snapshot.tarjeta) },
        { label: 'Transferencia verificada', valor: formatMoney(snapshot.transferenciaVerificada) },
        ...(snapshot.transferenciaPendiente > 0
          ? [{ label: 'Transferencias en validación', valor: formatMoney(snapshot.transferenciaPendiente) }]
          : []),
      ],
    },
    {
      tipo: 'tabla',
      titulo: 'Cobranza por día',
      headers: ['Día', 'Efectivo', 'Tarjeta', 'Transferencia', 'Total'],
      rightAlign: [1, 2, 3, 4],
      rows: snapshot.porDia.map((d) => [
        d.label,
        formatMoney(d.efectivo),
        formatMoney(d.tarjeta),
        formatMoney(d.transferencia),
        formatMoney(d.total),
      ]),
      footer: ['Total',
        formatMoney(snapshot.efectivo),
        formatMoney(snapshot.tarjeta),
        formatMoney(snapshot.transferenciaVerificada),
        formatMoney(snapshot.total),
      ],
    },
    {
      tipo: 'tabla',
      titulo: 'Por cobrador',
      headers: ['Cobrador', 'Pagos', 'Total cobrado'],
      rightAlign: [1, 2],
      rows: snapshot.porCobrador.map((c) => [c.nombre, c.numPagos, formatMoney(c.total)]),
    },
    {
      tipo: 'tabla',
      titulo: 'Por sucursal',
      headers: ['Sucursal', 'Pagos', 'Total cobrado'],
      rightAlign: [1, 2],
      rows: snapshot.porSucursal.map((s) => [s.nombre, s.numPagos, formatMoney(s.total)]),
    },
  ]

  const dataMetodo = [
    { name: 'Efectivo',                   value: snapshot.efectivo,                color: '#34d399' },
    { name: 'Tarjeta',                    value: snapshot.tarjeta,                 color: '#22d3ee' },
    { name: 'Transferencia verificada',   value: snapshot.transferenciaVerificada, color: '#7B6FFF' },
  ].filter((x) => x.value > 0)

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link href="/reportes" className="rounded-xl p-2 hover:bg-secondary transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Cobranza</h1>
            <p className="text-muted-foreground text-sm">
              {PERIODO_LABEL[periodo]} · {formatRangeShort(range)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <AutoRefresh intervalMs={60_000} />
          <ImprimirReporteButton
            data={{
              titulo: 'Reporte de cobranza',
              empresa: empresa?.nombre ?? 'MicroKapital',
              subtitulo: `${PERIODO_LABEL[periodo]} · ${formatRangeShort(range)}`,
              filtros: [],
              secciones: seccionesPrint,
            }}
            landscape
          />
        </div>
      </div>

      <FiltrosBar branches={opciones.branches} cobradores={opciones.cobradores} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Cobrado total"
          value={formatMoney(snapshot.total)}
          description={`${snapshot.numPagos} pagos`}
          icon={Wallet}
          color="green"
        />
        <MetricCard
          title="Efectivo"
          value={formatMoney(snapshot.efectivo)}
          icon={Banknote}
          color="green"
        />
        <MetricCard
          title="Tarjeta"
          value={formatMoney(snapshot.tarjeta)}
          icon={CreditCard}
          color="blue"
        />
        <MetricCard
          title="Transferencia"
          value={formatMoney(snapshot.transferenciaVerificada)}
          description={snapshot.transferenciaPendiente > 0 ? `+ ${formatMoney(snapshot.transferenciaPendiente)} pendiente` : undefined}
          icon={ArrowLeftRight}
          color="purple"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Cobranza por día</CardTitle></CardHeader>
          <CardContent>
            <ReportLineChart
              data={snapshot.porDia}
              xKey="label"
              series={[
                { dataKey: 'efectivo',      name: 'Efectivo',      color: '#34d399' },
                { dataKey: 'tarjeta',       name: 'Tarjeta',       color: '#22d3ee' },
                { dataKey: 'transferencia', name: 'Transferencia', color: '#7B6FFF' },
              ]}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Distribución por método</CardTitle></CardHeader>
          <CardContent>
            {dataMetodo.length === 0
              ? <p className="text-sm text-muted-foreground p-6 text-center">Sin pagos en el periodo.</p>
              : <ReportPieChart data={dataMetodo} tickFormatter={(v) => formatMoney(v)} />}
          </CardContent>
        </Card>
      </div>

      {esperada.total > 0 && (
        <Card>
          <CardContent className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-amber-500/15 p-2.5 ring-1 ring-amber-500/30">
                  <Clock className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Efectividad de cobranza</p>
                  <p className="text-xs text-muted-foreground">
                    Cobrado vs. esperado en el periodo ({esperada.numSchedules} pagos esperados)
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold money tabular-nums text-primary-300">
                  {efectividad.toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatMoney(snapshot.total)} / {formatMoney(esperada.total)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Cobranza por cobrador</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-muted-foreground text-xs uppercase tracking-wide sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2.5">Cobrador</th>
                  <th className="text-right px-4 py-2.5">Pagos</th>
                  <th className="text-right px-4 py-2.5">Cobrado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {snapshot.porCobrador.map((c) => (
                  <tr key={c.cobradorId} className="hover:bg-secondary/30">
                    <td className="px-4 py-2 font-medium truncate">{c.nombre}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{c.numPagos}</td>
                    <td className="px-4 py-2 text-right money tabular-nums">{formatMoney(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Cobranza por sucursal</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-muted-foreground text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2.5">Sucursal</th>
                  <th className="text-right px-4 py-2.5">Pagos</th>
                  <th className="text-right px-4 py-2.5">Cobrado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {snapshot.porSucursal.map((s) => (
                  <tr key={s.branchId} className="hover:bg-secondary/30">
                    <td className="px-4 py-2 font-medium">{s.nombre}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{s.numPagos}</td>
                    <td className="px-4 py-2 text-right money tabular-nums">{formatMoney(s.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
