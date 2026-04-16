import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { redirect, notFound } from 'next/navigation'
import { formatMoney, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, AlertTriangle, ShieldCheck, Percent } from 'lucide-react'
import Link from 'next/link'
import { Prisma } from '@prisma/client'

type TipoDetalle = 'pagos_vencidos' | 'seguros_mes' | 'comisiones_mes'

const TIPO_CONFIG: Record<TipoDetalle, { title: string; icon: React.ComponentType<{ className?: string }> }> = {
  pagos_vencidos: { title: 'Pagos vencidos', icon: AlertTriangle },
  seguros_mes: { title: 'Seguros cobrados este mes', icon: ShieldCheck },
  comisiones_mes: { title: 'Comisiones de apertura este mes', icon: Percent },
}

export default async function DashboardDetallePage({
  searchParams,
}: {
  searchParams: { tipo?: string }
}) {
  const session = await getSession()
  if (!session?.user || session.user.rol === 'COBRADOR') redirect('/cobros/agenda')

  const { rol, companyId, branchId: userBranchId, id: userId } = session.user
  const tipo = (searchParams.tipo ?? '') as TipoDetalle

  if (!TIPO_CONFIG[tipo]) notFound()

  const { title, icon: Icon } = TIPO_CONFIG[tipo]

  // Build loan scope
  const loanScope: Prisma.LoanWhereInput = { companyId: companyId! }
  if (rol === 'GERENTE_ZONAL') {
    const zoneIds = session.user.zonaBranchIds
    if (zoneIds?.length) loanScope.branchId = { in: zoneIds }
  } else if (rol === 'GERENTE') {
    const branchIds = session.user.zonaBranchIds?.length
      ? session.user.zonaBranchIds
      : userBranchId ? [userBranchId] : null
    if (branchIds?.length) loanScope.branchId = { in: branchIds }
  } else if (rol === 'COORDINADOR') {
    loanScope.cobradorId = userId
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

  if (tipo === 'pagos_vencidos') {
    const schedules = await prisma.paymentSchedule.findMany({
      where: {
        loan: { ...loanScope, estado: 'ACTIVE' },
        estado: 'OVERDUE',
      },
      orderBy: { fechaVencimiento: 'asc' },
      take: 200,
      include: {
        loan: {
          include: {
            client: { select: { id: true, nombreCompleto: true } },
            cobrador: { select: { nombre: true } },
          },
        },
      },
    })

    const totalAdeudado = schedules.reduce((s, sc) => s + Number(sc.montoPagado), 0)

    return (
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/dashboard"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Icon className="h-6 w-6 text-rose-400" />
              {title}
            </h1>
            <p className="text-muted-foreground text-sm">{schedules.length} pagos vencidos · Total adeudado: <span className="font-semibold text-rose-400">{formatMoney(totalAdeudado)}</span></p>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {schedules.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">No hay pagos vencidos</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/40">
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Cliente</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Cobrador</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">Pago #</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">Vencía</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {schedules.map((sc) => {
                      const diasVencido = Math.floor((Date.now() - new Date(sc.fechaVencimiento).getTime()) / 86400000)
                      return (
                        <tr key={sc.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2.5">
                            <Link href={`/clientes/${sc.loan.client.id}`} className="font-medium hover:underline text-primary">
                              {sc.loan.client.nombreCompleto}
                            </Link>
                            <p className="text-xs text-muted-foreground">{sc.loan.tipo}</p>
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground">{sc.loan.cobrador.nombre}</td>
                          <td className="px-4 py-2.5 text-right">{sc.numeroPago}</td>
                          <td className="px-4 py-2.5 text-right">
                            <span className="text-rose-400 font-medium">{formatDate(sc.fechaVencimiento)}</span>
                            <p className="text-xs text-muted-foreground">{diasVencido}d atrás</p>
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold">{formatMoney(Number(sc.montoPagado))}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  if (tipo === 'seguros_mes') {
    const loans = await prisma.loan.findMany({
      where: {
        ...loanScope,
        estado: 'ACTIVE',
        fechaDesembolso: { gte: firstOfMonth },
        seguro: { gt: 0 },
      },
      orderBy: { fechaDesembolso: 'desc' },
      take: 200,
      include: {
        client: { select: { id: true, nombreCompleto: true } },
        cobrador: { select: { nombre: true } },
        branch: { select: { nombre: true } },
      },
    })

    const totalSeguros = loans.reduce((s, l) => s + Number(l.seguro ?? 0), 0)

    return (
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/dashboard"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Icon className="h-6 w-6 text-indigo-400" />
              {title}
            </h1>
            <p className="text-muted-foreground text-sm">{loans.length} créditos · Total: <span className="font-semibold text-indigo-400">{formatMoney(totalSeguros)}</span></p>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {loans.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">No hay seguros cobrados este mes</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/40">
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Cliente</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Sucursal</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Cobrador</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">Desembolso</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">Capital</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">Seguro</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {loans.map((loan) => (
                      <tr key={loan.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5">
                          <Link href={`/clientes/${loan.client.id}`} className="font-medium hover:underline text-primary">
                            {loan.client.nombreCompleto}
                          </Link>
                          <p className="text-xs text-muted-foreground">{loan.tipo}</p>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{loan.branch?.nombre ?? '—'}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{loan.cobrador.nombre}</td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">
                          {loan.fechaDesembolso ? formatDate(loan.fechaDesembolso) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right">{formatMoney(Number(loan.capital))}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-indigo-400">{formatMoney(Number(loan.seguro ?? 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  if (tipo === 'comisiones_mes') {
    const loans = await prisma.loan.findMany({
      where: {
        ...loanScope,
        estado: 'ACTIVE',
        fechaDesembolso: { gte: firstOfMonth },
        comision: { gt: 0 },
      },
      orderBy: { fechaDesembolso: 'desc' },
      take: 200,
      include: {
        client: { select: { id: true, nombreCompleto: true } },
        cobrador: { select: { nombre: true } },
        branch: { select: { nombre: true } },
      },
    })

    const totalComisiones = loans.reduce((s, l) => s + Number(l.comision ?? 0), 0)

    return (
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/dashboard"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Icon className="h-6 w-6 text-orange-400" />
              {title}
            </h1>
            <p className="text-muted-foreground text-sm">{loans.length} créditos · Total: <span className="font-semibold text-orange-400">{formatMoney(totalComisiones)}</span></p>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {loans.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">No hay comisiones cobradas este mes</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/40">
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Cliente</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Sucursal</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Cobrador</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">Desembolso</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">Capital</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">Comisión</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {loans.map((loan) => (
                      <tr key={loan.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5">
                          <Link href={`/clientes/${loan.client.id}`} className="font-medium hover:underline text-primary">
                            {loan.client.nombreCompleto}
                          </Link>
                          <p className="text-xs text-muted-foreground">{loan.tipo}</p>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{loan.branch?.nombre ?? '—'}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{loan.cobrador.nombre}</td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">
                          {loan.fechaDesembolso ? formatDate(loan.fechaDesembolso) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right">{formatMoney(Number(loan.capital))}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-orange-400">{formatMoney(Number(loan.comision ?? 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  notFound()
}
