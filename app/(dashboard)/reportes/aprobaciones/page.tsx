export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, ClipboardList, AlertTriangle } from 'lucide-react'
import { formatMoney, formatDate } from '@/lib/utils'
import { parseMxYMD, todayMx } from '@/lib/timezone'
import { ImprimirReporteButton, type SeccionReporte } from '@/components/reportes/ImprimirReporteButton'
import { EditableFechaPrimerPago } from '@/components/reportes/EditableFechaPrimerPago'
import type { Prisma, LoanType } from '@prisma/client'

const ALLOWED_ROLES = ['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'SUPER_ADMIN'] as const

const TIPO_LABEL: Record<string, string> = {
  SOLIDARIO: 'Solidario', INDIVIDUAL: 'Individual', AGIL: 'Ágil', FIDUCIARIO: 'Fiduciario',
}
const ESTADO_LABEL: Record<string, string> = {
  APPROVED: 'Aprobado (sin activar)',
  IN_ACTIVATION: 'En activación',
  ACTIVE: 'Activo',
  LIQUIDATED: 'Liquidado',
  DEFAULTED: 'Incumplido',
  RESTRUCTURED: 'Reestructurado',
  DECLINED: 'Declinado',
  REJECTED: 'Rechazado',
}

const PRODUCTO_OPCIONES: LoanType[] = ['SOLIDARIO', 'INDIVIDUAL', 'AGIL', 'FIDUCIARIO']

interface SearchParams {
  desde?: string
  hasta?: string
  sucursal?: string
  cobrador?: string
  producto?: string
  soloSinFechas?: string
}

export default async function ReporteAprobacionesPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  if (!ALLOWED_ROLES.includes(session.user.rol as typeof ALLOWED_ROLES[number])) redirect('/dashboard')

  const { companyId } = session.user

  // Rango default: últimos 30 días.
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
  const hastaEnd = new Date(hasta)
  hastaEnd.setUTCDate(hastaEnd.getUTCDate() + 1)

  const soloSinFechas = searchParams.soloSinFechas === '1'
  const productoFiltro = PRODUCTO_OPCIONES.includes(searchParams.producto as LoanType)
    ? (searchParams.producto as LoanType)
    : null

  // Nota: el filtro "solo sin fechas" se aplica en memoria después de
  // resolver la fecha efectiva (Loan.fechaPrimerPago ?? schedule[0].
  // fechaVencimiento). Si filtráramos en la BD por fechaPrimerPago null,
  // marcaríamos como "sin fechas" créditos que ya tienen fecha real en
  // el calendario aunque el campo del Loan haya quedado en null.
  const where: Prisma.LoanWhereInput = {
    companyId: companyId!,
    aprobadoAt: { gte: desde, lt: hastaEnd },
    ...(searchParams.sucursal ? { branchId: searchParams.sucursal } : {}),
    ...(searchParams.cobrador ? { cobradorId: searchParams.cobrador } : {}),
    ...(productoFiltro ? { tipo: productoFiltro } : {}),
  }

  const [loans, branches, cobradores, empresa] = await Promise.all([
    prisma.loan.findMany({
      where,
      orderBy: { aprobadoAt: 'desc' },
      take: 500,
      select: {
        id: true,
        estado: true,
        tipo: true,
        capital: true,
        aprobadoAt: true,
        fechaDesembolso: true,
        fechaPrimerPago: true,
        createdAt: true,
        loanGroupId: true,
        client: { select: { nombreCompleto: true } },
        cobrador: { select: { nombre: true } },
        aprobadoPor: { select: { nombre: true } },
        branch: { select: { nombre: true } },
        loanGroup: { select: { nombre: true } },
        // Primera cuota del calendario — sirve como "fecha real" cuando
        // Loan.fechaPrimerPago quedó en null pero el schedule sí se generó
        // al activar. Evita mostrar "Falta" cuando en realidad hay fecha.
        schedule: {
          where: { numeroPago: 1 },
          select: { fechaVencimiento: true },
          take: 1,
        },
      },
    }),
    prisma.branch.findMany({
      where: { companyId: companyId!, activa: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),
    prisma.user.findMany({
      where: {
        companyId: companyId!,
        activo: true,
        rol: { in: ['COORDINADOR', 'COBRADOR', 'GERENTE', 'GERENTE_ZONAL'] },
        ...(searchParams.sucursal ? { branchId: searchParams.sucursal } : {}),
      },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),
    prisma.company.findUnique({ where: { id: companyId! }, select: { nombre: true } }),
  ])

  // Fecha real del primer pago: Loan.fechaPrimerPago si existe, si no
  // la fechaVencimiento del pago #1 del calendario (que es lo que ve el
  // cliente). Solo se considera "sin fecha" cuando NINGUNA fuente aplica.
  const loansConFecha = loans.map((l) => ({
    ...l,
    fechaPrimerPagoEfectiva: l.fechaPrimerPago ?? l.schedule[0]?.fechaVencimiento ?? null,
    fechaDesembolsoEfectiva: l.fechaDesembolso ?? null,
  }))
  const loansVisibles = soloSinFechas
    ? loansConFecha.filter((l) => !l.fechaPrimerPagoEfectiva)
    : loansConFecha
  const filasIncompletas = loansConFecha.filter((l) => !l.fechaPrimerPagoEfectiva)

  const desdeYmd = desde.toISOString().slice(0, 10)
  const hastaYmd = hasta.toISOString().slice(0, 10)

  // Datos para el reporte imprimible.
  const seccionesPrint: SeccionReporte[] = [
    {
      tipo: 'metricas',
      titulo: 'Resumen',
      items: [
        { label: 'Aprobaciones', valor: loansVisibles.length.toLocaleString('es-MX') },
        { label: 'Sin fecha de primer pago', valor: filasIncompletas.length.toLocaleString('es-MX') },
        { label: 'Capital aprobado', valor: formatMoney(loansVisibles.reduce((s, l) => s + Number(l.capital), 0)) },
      ],
    },
    {
      tipo: 'tabla',
      titulo: 'Detalle de aprobaciones',
      headers: ['Aprobado', 'Cliente', 'Producto', 'Capital', 'Sucursal', 'Cobrador', 'Aprobó', 'Estado', 'F. Desembolso', 'F. Primer pago'],
      rightAlign: [3],
      rows: loansVisibles.map((l) => [
        l.aprobadoAt ? formatDate(l.aprobadoAt) : '—',
        l.tipo === 'SOLIDARIO' && l.loanGroup?.nombre
          ? `${l.client.nombreCompleto} — Grupo ${l.loanGroup.nombre}`
          : l.client.nombreCompleto,
        TIPO_LABEL[l.tipo] ?? l.tipo,
        formatMoney(Number(l.capital)),
        l.branch?.nombre ?? '—',
        l.cobrador.nombre,
        l.aprobadoPor?.nombre ?? '—',
        ESTADO_LABEL[l.estado] ?? l.estado,
        l.fechaDesembolsoEfectiva ? formatDate(l.fechaDesembolsoEfectiva) : '—',
        l.fechaPrimerPagoEfectiva ? formatDate(l.fechaPrimerPagoEfectiva) : '—',
      ]),
    },
  ]

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link href="/prestamos" className="rounded-xl p-2 hover:bg-secondary transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary-500" />
              Reporte de aprobaciones
            </h1>
            <p className="text-muted-foreground text-sm">
              {formatDate(desde)} – {formatDate(hasta)} · {loansVisibles.length} crédito(s)
              {filasIncompletas.length > 0 && (
                <> · <span className="text-amber-500 font-medium">{filasIncompletas.length} sin fecha de primer pago</span></>
              )}
            </p>
          </div>
        </div>
        <ImprimirReporteButton
          data={{
            titulo: 'Reporte de aprobaciones',
            empresa: empresa?.nombre ?? 'MicroKapital',
            subtitulo: `${formatDate(desde)} – ${formatDate(hasta)}`,
            filtros: [
              ...(searchParams.sucursal
                ? [{ label: 'Sucursal', valor: branches.find((b) => b.id === searchParams.sucursal)?.nombre ?? '—' }]
                : []),
              ...(searchParams.cobrador
                ? [{ label: 'Cobrador', valor: cobradores.find((c) => c.id === searchParams.cobrador)?.nombre ?? '—' }]
                : []),
              ...(productoFiltro
                ? [{ label: 'Producto', valor: TIPO_LABEL[productoFiltro] ?? productoFiltro }]
                : []),
              ...(soloSinFechas ? [{ label: 'Filtro', valor: 'Solo sin fechas' }] : []),
            ],
            secciones: seccionesPrint,
          }}
          landscape
        />
      </div>

      {/* Filtros */}
      <form className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Aprobado desde</label>
          <input
            type="date"
            name="desde"
            defaultValue={desdeYmd}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm h-9"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Aprobado hasta</label>
          <input
            type="date"
            name="hasta"
            defaultValue={hastaYmd}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm h-9"
          />
        </div>
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
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Cobrador</label>
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
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Producto</label>
          <select
            name="producto"
            defaultValue={productoFiltro ?? ''}
            className="border border-input rounded-md px-3 py-1.5 text-sm h-9 min-w-[140px] bg-background"
          >
            <option value="">Todos</option>
            {PRODUCTO_OPCIONES.map((p) => (
              <option key={p} value={p}>{TIPO_LABEL[p] ?? p}</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm h-9 pl-2">
          <input
            type="checkbox"
            name="soloSinFechas"
            value="1"
            defaultChecked={soloSinFechas}
            className="rounded border-input"
          />
          Solo sin fechas
        </label>
        <Button type="submit" variant="secondary" size="sm" className="h-9">Filtrar</Button>
      </form>

      {/* Alerta si hay filas sin ninguna fecha real (ni en Loan ni en el
          calendario del cliente). Los que sí tienen fecha en el schedule
          se muestran normal aunque Loan.fechaPrimerPago esté null. */}
      {filasIncompletas.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-500">
                Hay {filasIncompletas.length} crédito(s) sin fecha de primer pago capturada
              </p>
              <p className="text-muted-foreground mt-0.5">
                Estos aún no tienen calendario generado. Edita la fecha desde esta tabla o desde el detalle del préstamo.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabla */}
      <Card>
        <CardHeader><CardTitle className="text-base">Detalle</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {loansVisibles.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              Sin aprobaciones en el rango seleccionado.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/40 text-xs text-muted-foreground">
                  <th className="text-left px-4 py-2 font-medium">Aprobado</th>
                  <th className="text-left px-4 py-2 font-medium">Cliente</th>
                  <th className="text-left px-4 py-2 font-medium">Producto</th>
                  <th className="text-right px-4 py-2 font-medium">Capital</th>
                  <th className="text-left px-4 py-2 font-medium">Sucursal</th>
                  <th className="text-left px-4 py-2 font-medium">Cobrador</th>
                  <th className="text-left px-4 py-2 font-medium">Aprobó</th>
                  <th className="text-left px-4 py-2 font-medium">Estado</th>
                  <th className="text-left px-4 py-2 font-medium">F. Desembolso</th>
                  <th className="text-left px-4 py-2 font-medium">F. Primer pago</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {loansVisibles.map((l) => {
                  // Solo resaltamos las filas donde en verdad no hay fecha
                  // real del primer pago (ni en Loan ni en el calendario).
                  const sinFecha = !l.fechaPrimerPagoEfectiva
                  return (
                    <tr
                      key={l.id}
                      className={`hover:bg-secondary/30 ${sinFecha ? 'bg-amber-500/5' : ''}`}
                    >
                      <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                        {l.aprobadoAt ? formatDate(l.aprobadoAt) : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <Link href={`/prestamos/${l.id}`} className="hover:underline text-primary-400">
                          {l.client.nombreCompleto}
                        </Link>
                        {l.tipo === 'SOLIDARIO' && l.loanGroup?.nombre && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Grupo: <span className="text-violet-400 font-medium">{l.loanGroup.nombre}</span>
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-2">{TIPO_LABEL[l.tipo] ?? l.tipo}</td>
                      <td className="px-4 py-2 text-right font-semibold money">{formatMoney(Number(l.capital))}</td>
                      <td className="px-4 py-2 text-muted-foreground">{l.branch?.nombre ?? '—'}</td>
                      <td className="px-4 py-2 text-muted-foreground">{l.cobrador.nombre}</td>
                      <td className="px-4 py-2 text-muted-foreground">{l.aprobadoPor?.nombre ?? '—'}</td>
                      <td className="px-4 py-2">
                        <span className={`text-xs font-medium ${
                          l.estado === 'ACTIVE' ? 'text-emerald-400'
                          : l.estado === 'APPROVED' ? 'text-amber-400'
                          : l.estado === 'IN_ACTIVATION' ? 'text-blue-400'
                          : 'text-muted-foreground'
                        }`}>
                          {ESTADO_LABEL[l.estado] ?? l.estado}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {l.fechaDesembolsoEfectiva ? formatDate(l.fechaDesembolsoEfectiva) : '—'}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <EditableFechaPrimerPago
                          loanId={l.id}
                          fechaActual={l.fechaPrimerPagoEfectiva}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
