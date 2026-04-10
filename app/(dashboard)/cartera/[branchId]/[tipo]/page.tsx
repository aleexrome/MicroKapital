import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatMoney, formatDate } from '@/lib/utils'
import { ArrowLeft, Users, UserCheck, Zap, Landmark, CreditCard } from 'lucide-react'

const TIPO_ICON: Record<string, React.ReactNode> = {
  SOLIDARIO:  <Users      className="h-5 w-5" />,
  INDIVIDUAL: <UserCheck  className="h-5 w-5" />,
  AGIL:       <Zap        className="h-5 w-5" />,
  FIDUCIARIO: <Landmark   className="h-5 w-5" />,
}
const TIPO_LABEL: Record<string, string> = {
  SOLIDARIO: 'Solidario', INDIVIDUAL: 'Individual', AGIL: 'Ágil', FIDUCIARIO: 'Fiduciario',
}

export default async function CarteraTipoPage({
  params,
}: {
  params: { branchId: string; tipo: string }
}) {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  const { rol, companyId, id: userId } = session.user
  const { branchId, tipo } = params

  const TIPOS_VALIDOS = ['SOLIDARIO', 'INDIVIDUAL', 'AGIL', 'FIDUCIARIO']
  if (!TIPOS_VALIDOS.includes(tipo)) notFound()

  // Verify user can see this branch
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, companyId: companyId!, activa: true },
    select: { id: true, nombre: true },
  })
  if (!branch) notFound()

  const isDirector = rol === 'DIRECTOR_GENERAL' || rol === 'DIRECTOR_COMERCIAL'
  const isGerente  = rol === 'GERENTE_ZONAL' || rol === 'GERENTE'

  // Scope check for non-directors
  if (!isDirector) {
    const zoneIds = session.user.zonaBranchIds
    if (rol === 'GERENTE_ZONAL' && zoneIds && !zoneIds.includes(branchId)) redirect('/cartera')
    if (rol === 'GERENTE' && session.user.branchId !== branchId) redirect('/cartera')
  }

  // ── SOLIDARIO: show groups ─────────────────────────────────────────────────
  if (tipo === 'SOLIDARIO') {
    const groups = await prisma.loanGroup.findMany({
      where: {
        branchId,
        activo: true,
        loans: {
          some: {
            tipo: 'SOLIDARIO',
            estado: 'ACTIVE',
            companyId: companyId!,
            ...((!isDirector && !isGerente) ? { cobradorId: userId } : {}),
          },
        },
      },
      include: {
        cobrador: { select: { nombre: true } },
        loans: {
          where: { tipo: 'SOLIDARIO', estado: 'ACTIVE', companyId: companyId! },
          select: {
            id: true,
            capital: true,
            totalPago: true,
            schedule: {
              where: { estado: { not: 'PAID' } },
              orderBy: { numeroPago: 'asc' },
              take: 1,
              select: { fechaVencimiento: true, estado: true },
            },
            client: { select: { nombreCompleto: true } },
          },
        },
      },
      orderBy: { nombre: 'asc' },
    })

    return (
      <div className="p-6 space-y-5 max-w-3xl mx-auto">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href={`/cartera/${branchId}`}><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-primary-600">{TIPO_ICON[tipo]}</span>
              <h1 className="text-2xl font-bold">Solidario — {branch.nombre}</h1>
            </div>
            <p className="text-muted-foreground text-sm">{groups.length} grupo(s) activo(s)</p>
          </div>
        </div>

        {groups.length === 0 && (
          <Card><CardContent className="py-10 text-center text-muted-foreground">No hay grupos Solidario activos en esta sucursal</CardContent></Card>
        )}

        {groups.map((grupo) => {
          const totalCapital = grupo.loans.reduce((s, l) => s + Number(l.capital), 0)
          const nextPago = grupo.loans.flatMap((l) => l.schedule).sort(
            (a, b) => new Date(a.fechaVencimiento).getTime() - new Date(b.fechaVencimiento).getTime()
          )[0]
          const hasOverdue = grupo.loans.some((l) => l.schedule[0]?.estado === 'OVERDUE')

          return (
            <Card key={grupo.id} className={hasOverdue ? 'border-red-200' : ''}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900">{grupo.nombre}</p>
                      {hasOverdue && <Badge variant="error" className="text-xs">Con vencidos</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {grupo.cobrador.nombre} · {grupo.loans.length} integrantes · Capital: {formatMoney(totalCapital)}
                    </p>
                    {nextPago && (
                      <p className="text-xs text-muted-foreground">
                        Próximo pago: {formatDate(nextPago.fechaVencimiento)}
                      </p>
                    )}
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/cobros/grupo/${grupo.id}`}>
                      <Users className="h-3 w-3 mr-1" />Reunión
                    </Link>
                  </Button>
                </div>
                <div className="space-y-1">
                  {grupo.loans.map((loan) => (
                    <div key={loan.id} className="flex items-center justify-between text-xs">
                      <Link href={`/prestamos/${loan.id}`} className="hover:underline text-gray-700">
                        {loan.client.nombreCompleto}
                      </Link>
                      <span className="font-medium">{formatMoney(Number(loan.capital))}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    )
  }

  // ── INDIVIDUAL / AGIL / FIDUCIARIO: show clients grouped by coordinator ─────
  const loans = await prisma.loan.findMany({
    where: {
      branchId,
      tipo: tipo as 'INDIVIDUAL' | 'AGIL' | 'FIDUCIARIO',
      estado: 'ACTIVE',
      companyId: companyId!,
      ...((!isDirector && !isGerente) ? { cobradorId: userId } : {}),
    },
    orderBy: [{ cobrador: { nombre: 'asc' } }, { client: { nombreCompleto: 'asc' } }],
    include: {
      client: { select: { id: true, nombreCompleto: true, telefono: true } },
      cobrador: { select: { id: true, nombre: true } },
      schedule: {
        where: { estado: { not: 'PAID' } },
        orderBy: { numeroPago: 'asc' },
        take: 1,
      },
    },
  })

  const totalCapital = loans.reduce((s, l) => s + Number(l.capital), 0)
  const vencidos = loans.filter((l) => l.schedule[0]?.estado === 'OVERDUE').length

  // Agrupar por coordinador
  const porCoordinador = new Map<string, { nombre: string; loans: typeof loans }>()
  for (const loan of loans) {
    const cId = loan.cobradorId ?? 'sin-asignar'
    const cNombre = loan.cobrador?.nombre ?? 'Sin asignar'
    if (!porCoordinador.has(cId)) porCoordinador.set(cId, { nombre: cNombre, loans: [] })
    porCoordinador.get(cId)!.loans.push(loan)
  }

  return (
    <div className="p-6 space-y-5 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href={`/cartera/${branchId}`}><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-primary-600">{TIPO_ICON[tipo]}</span>
            <h1 className="text-2xl font-bold">{TIPO_LABEL[tipo]} — {branch.nombre}</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            {loans.length} crédito(s) activo(s) · Capital: {formatMoney(totalCapital)}
            {vencidos > 0 && ` · ${vencidos} vencido(s)`}
          </p>
        </div>
      </div>

      {loans.length === 0 && (
        <Card><CardContent className="py-10 text-center text-muted-foreground">No hay créditos {TIPO_LABEL[tipo]} activos en esta sucursal</CardContent></Card>
      )}

      {Array.from(porCoordinador.values()).map(({ nombre: cobradorNombre, loans: cobradorLoans }) => (
        <div key={cobradorNombre} className="space-y-2">
          {/* Encabezado coordinador */}
          <div className="flex items-center gap-2 px-1 pt-2">
            <UserCheck className="h-4 w-4 text-primary-600" />
            <p className="text-sm font-semibold text-gray-700">{cobradorNombre}</p>
            <span className="text-xs text-muted-foreground">· {cobradorLoans.length} crédito(s)</span>
          </div>

          {cobradorLoans.map((loan) => {
            const pago = loan.schedule[0]
            const overdue = pago?.estado === 'OVERDUE'
            return (
              <Card key={loan.id} className={overdue ? 'border-red-200' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link href={`/clientes/${loan.client.id}`} className="font-semibold hover:underline truncate">
                          {loan.client.nombreCompleto}
                        </Link>
                        {overdue && <Badge variant="error" className="text-xs shrink-0">Vencido</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {loan.client.telefono && `${loan.client.telefono}`}
                        {pago && ` · Pago ${pago.numeroPago} — ${formatDate(pago.fechaVencimiento)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-bold text-sm">{formatMoney(Number(loan.capital))}</span>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/prestamos/${loan.id}`}>
                          <CreditCard className="h-3 w-3" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      ))}
    </div>
  )
}
