import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatMoney, formatDate } from '@/lib/utils'
import { ArrowLeft, Users, CreditCard, CheckCircle2, AlertCircle, ClipboardList } from 'lucide-react'
import type { ScheduleStatus, Prisma } from '@prisma/client'

const STATUS_VARIANT: Record<ScheduleStatus, 'success' | 'warning' | 'error' | 'info' | 'outline'> = {
  PAID: 'success',
  PENDING: 'warning',
  OVERDUE: 'error',
  PARTIAL: 'info',
  ADVANCE: 'success',
  FINANCIADO: 'outline',
}
const STATUS_LABEL: Record<ScheduleStatus, string> = {
  PAID: 'Pagado',
  PENDING: 'Pendiente',
  OVERDUE: 'Vencido',
  PARTIAL: 'Parcial',
  ADVANCE: 'Adelantado',
  FINANCIADO: 'Financiado',
}

export default async function GrupoCobroPage({ params }: { params: { groupId: string } }) {
  const session = await getSession()
  if (!session?.user) return null

  const { companyId, rol, branchId, id: userId } = session.user
  const tienePermisoAplicar = session.user.permisoAplicarPagos === true

  // Alcance de loans por rol — consistente con el resto de la app.
  const loanScope: Prisma.LoanWhereInput = { estado: 'ACTIVE', companyId: companyId! }
  if (rol === 'COORDINADOR' || rol === 'COBRADOR') {
    loanScope.cobradorId = userId
  } else if (rol === 'GERENTE' || rol === 'GERENTE_ZONAL') {
    const zoneIds = session.user.zonaBranchIds?.length
      ? session.user.zonaBranchIds
      : branchId ? [branchId] : null
    if (zoneIds?.length) loanScope.branchId = { in: zoneIds }
  } else if (tienePermisoAplicar && branchId) {
    loanScope.branchId = branchId
  }
  // DIRECTOR_GENERAL / SUPER_ADMIN: sin restricción extra dentro de la empresa.

  const grupo = await prisma.loanGroup.findUnique({
    where: { id: params.groupId },
    include: {
      loans: {
        where: loanScope,
        include: {
          client: { select: { id: true, nombreCompleto: true, telefono: true } },
          schedule: {
            where: { estado: { in: ['PENDING', 'OVERDUE', 'PARTIAL'] } },
            orderBy: { numeroPago: 'asc' },
            take: 1,
          },
        },
      },
    },
  })

  if (!grupo) notFound()

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Total esperado del grupo en esta reunión
  const totalEsperado = grupo.loans.reduce((sum, loan) => {
    const pago = loan.schedule[0]
    return sum + (pago ? Number(pago.montoEsperado) : 0)
  }, 0)

  const pagados  = grupo.loans.filter((l) => l.schedule[0] === undefined || l.schedule[0]?.estado === 'PAID').length
  const vencidos = grupo.loans.filter((l) => l.schedule[0]?.estado === 'OVERDUE').length

  return (
    <div className="p-4 max-w-lg mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/cobros/agenda"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary-600" />
            <h1 className="text-xl font-bold text-gray-900">{grupo.nombre}</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {formatDate(today, "EEEE d 'de' MMMM")} · Grupo Solidario
          </p>
        </div>
      </div>

      {/* Resumen del grupo */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-primary-50 rounded-lg p-3 text-center">
          <p className="text-xs text-primary-600 font-medium">Por cobrar</p>
          <p className="text-base font-bold text-primary-800">{formatMoney(totalEsperado)}</p>
        </div>
        <div className={`rounded-lg p-3 text-center ${vencidos > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
          <p className={`text-xs font-medium ${vencidos > 0 ? 'text-red-600' : 'text-green-600'}`}>Vencidos</p>
          <p className={`text-base font-bold ${vencidos > 0 ? 'text-red-800' : 'text-green-800'}`}>{vencidos}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-600 font-medium">Integrantes</p>
          <p className="text-base font-bold text-gray-800">{grupo.loans.length}</p>
        </div>
      </div>

      {/* Aviso de responsabilidad solidaria */}
      {vencidos > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            <strong>{vencidos} integrante(s) con pago vencido.</strong> El grupo es responsable solidario.
            Coordina con los demás miembros para cubrir el saldo.
          </p>
        </div>
      )}

      {/* Lista de integrantes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Integrantes del grupo</CardTitle>
        </CardHeader>
        <CardContent className="p-0 divide-y">
          {grupo.loans.map((loan) => {
            const pago = loan.schedule[0]
            const yaPago = !pago || pago.estado === 'PAID' || pago.estado === 'ADVANCE'

            return (
              <div key={loan.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      {yaPago
                        ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                        : <div className="h-4 w-4 rounded-full border-2 border-gray-300 shrink-0" />
                      }
                      <p className="font-medium text-gray-900 truncate">{loan.client.nombreCompleto}</p>
                    </div>
                    {loan.client.telefono && (
                      <p className="text-xs text-muted-foreground ml-6">{loan.client.telefono}</p>
                    )}
                    {pago && (
                      <div className="flex items-center gap-2 mt-1 ml-6">
                        <Badge variant={STATUS_VARIANT[pago.estado as ScheduleStatus]} className="text-xs">
                          {STATUS_LABEL[pago.estado as ScheduleStatus]}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Pago {pago.numeroPago} · vence {formatDate(pago.fechaVencimiento)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {pago && (
                      <span className="font-bold text-gray-900">
                        {formatMoney(Number(pago.montoEsperado))}
                      </span>
                    )}
                    {pago && !yaPago && (
                      <Button asChild size="sm" className="h-7 text-xs px-3">
                        <Link href={`/cobros/capturar/${pago.id}`}>
                          <CreditCard className="h-3 w-3 mr-1" />Capturar
                        </Link>
                      </Button>
                    )}
                    {yaPago && (
                      <span className="text-xs text-green-600 font-medium">Pagado</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {grupo.loans.length === 0 && (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No hay créditos activos en este grupo
            </div>
          )}
        </CardContent>
      </Card>

      {/* Botón principal: registrar todos los pagos */}
      {grupo.loans.some((l) => l.schedule[0] && l.schedule[0].estado !== 'PAID') && (
        <Button asChild size="lg" className="w-full">
          <Link href={`/cobros/grupo/${params.groupId}/capturar`}>
            <ClipboardList className="h-5 w-5 mr-2" />
            Registrar pagos del grupo
          </Link>
        </Button>
      )}

      <p className="text-xs text-muted-foreground text-center">
        En el modelo Solidario el grupo es colectivamente responsable.
        Si una integrante no paga, otra puede cubrirla.
      </p>
    </div>
  )
}
