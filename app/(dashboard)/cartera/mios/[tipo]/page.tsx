/**
 * Cartera propia del Coordinador/Cobrador — sin branch navigation
 * /cartera/mios/[tipo]
 */
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatMoney, formatDate } from '@/lib/utils'
import { ArrowLeft, Users, UserCheck, Zap, Landmark, CreditCard } from 'lucide-react'
import { SolidarioGroupList, type SolidarioGroup } from '@/components/loans/SolidarioGroupList'

const TIPO_ICON: Record<string, React.ReactNode> = {
  SOLIDARIO:  <Users      className="h-5 w-5" />,
  INDIVIDUAL: <UserCheck  className="h-5 w-5" />,
  AGIL:       <Zap        className="h-5 w-5" />,
  FIDUCIARIO: <Landmark   className="h-5 w-5" />,
}
const TIPO_LABEL: Record<string, string> = {
  SOLIDARIO: 'Solidario', INDIVIDUAL: 'Individual', AGIL: 'Ágil', FIDUCIARIO: 'Fiduciario',
}

export default async function CarteraMiosTipoPage({ params }: { params: { tipo: string } }) {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  const { rol, companyId, id: userId } = session.user
  const { tipo } = params

  if (rol !== 'COORDINADOR' && rol !== 'COBRADOR') redirect('/cartera')

  const TIPOS_VALIDOS = ['SOLIDARIO', 'INDIVIDUAL', 'AGIL', 'FIDUCIARIO']
  if (!TIPOS_VALIDOS.includes(tipo)) notFound()

  // ── SOLIDARIO: show own groups ─────────────────────────────────────────────
  if (tipo === 'SOLIDARIO') {
    const groups = await prisma.loanGroup.findMany({
      where: {
        cobradorId: userId,
        activo: true,
        loans: { some: { tipo: 'SOLIDARIO', estado: 'ACTIVE', companyId: companyId! } },
      },
      include: {
        loans: {
          where: { tipo: 'SOLIDARIO', estado: 'ACTIVE', companyId: companyId! },
          select: {
            id: true,
            capital: true,
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

    const groupData: SolidarioGroup[] = groups.map((grupo) => {
      const totalCapital = grupo.loans.reduce((s, l) => s + Number(l.capital), 0)
      const hasOverdue   = grupo.loans.some((l) => l.schedule[0]?.estado === 'OVERDUE')
      const nextPago     = grupo.loans
        .flatMap((l) => l.schedule)
        .sort((a, b) => new Date(a.fechaVencimiento).getTime() - new Date(b.fechaVencimiento).getTime())[0]

      return {
        id:              grupo.id,
        nombre:          grupo.nombre,
        totalCapital,
        integranteCount: grupo.loans.length,
        hasOverdue,
        nextFecha:       nextPago
          ? new Date(nextPago.fechaVencimiento).toISOString().slice(0, 10)
          : null,
        loans: grupo.loans.map((l) => ({
          id:         l.id,
          capital:    Number(l.capital),
          clientName: l.client.nombreCompleto,
        })),
      }
    })

    return (
      <div className="p-6 space-y-5 max-w-3xl mx-auto">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/cobros/agenda"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-primary-600">{TIPO_ICON[tipo]}</span>
              <h1 className="text-2xl font-bold">Mis grupos Solidario</h1>
            </div>
            <p className="text-muted-foreground text-sm">{groups.length} grupo(s)</p>
          </div>
        </div>

        <SolidarioGroupList groups={groupData} />
      </div>
    )
  }

  // ── INDIVIDUAL / AGIL / FIDUCIARIO: own clients ────────────────────────────
  const loans = await prisma.loan.findMany({
    where: {
      tipo: tipo as 'INDIVIDUAL' | 'AGIL' | 'FIDUCIARIO',
      estado: 'ACTIVE',
      companyId: companyId!,
      cobradorId: userId,
    },
    orderBy: { createdAt: 'desc' },
    include: {
      client: { select: { id: true, nombreCompleto: true, telefono: true } },
      schedule: {
        where: { estado: { not: 'PAID' } },
        orderBy: { numeroPago: 'asc' },
        take: 1,
      },
    },
  })

  const totalCapital = loans.reduce((s, l) => s + Number(l.capital), 0)
  const vencidos = loans.filter((l) => l.schedule[0]?.estado === 'OVERDUE').length

  return (
    <div className="p-6 space-y-5 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/cobros/agenda"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-primary-600">{TIPO_ICON[tipo]}</span>
            <h1 className="text-2xl font-bold">Mis créditos {TIPO_LABEL[tipo]}</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            {loans.length} crédito(s) · {formatMoney(totalCapital)}
            {vencidos > 0 && ` · ${vencidos} vencido(s)`}
          </p>
        </div>
      </div>

      {loans.length === 0 && (
        <Card><CardContent className="py-10 text-center text-muted-foreground">No tienes créditos {TIPO_LABEL[tipo]} activos</CardContent></Card>
      )}

      <div className="space-y-2">
        {loans.map((loan) => {
          const pago = loan.schedule[0]
          const overdue = pago?.estado === 'OVERDUE'
          return (
            <Card key={loan.id} className={overdue ? 'border-red-200' : ''}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link href={`/clientes/${loan.client.id}`} className="font-semibold hover:underline truncate">
                      {loan.client.nombreCompleto}
                    </Link>
                    {overdue && <Badge variant="error" className="text-xs shrink-0">Vencido</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {loan.client.telefono ?? 'Sin teléfono'}
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
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
