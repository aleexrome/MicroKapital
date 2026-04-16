import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Users } from 'lucide-react'
import { GrupoCalendar } from '@/components/loans/GrupoCalendar'
import { type Prisma } from '@prisma/client'

const SOLIDARIO_UMBRAL             = 6
const SOLIDARIO_PAGOS_FINANCIADOS  = 2
const ROLES_PUEDEN_RENOVAR = ['COORDINADOR', 'COBRADOR', 'GERENTE', 'GERENTE_ZONAL', 'SUPER_ADMIN']

export default async function GrupoCalendarioPage({ params }: { params: { groupId: string } }) {
  const session = await getSession()
  if (!session?.user) return null

  const { companyId, rol, branchId, id: userId } = session.user
  const esOpAdmin = rol === 'DIRECTOR_GENERAL' || rol === 'SUPER_ADMIN'
  // Usuarios con permiso especial pueden actuar en grupos de su propia sucursal
  const tienePermisoAplicar = session.user.permisoAplicarPagos === true

  // Scope loans by role
  const loanWhere: Prisma.LoanWhereInput = { companyId: companyId! }
  if (rol === 'COORDINADOR' || rol === 'COBRADOR') {
    loanWhere.cobradorId = userId
  } else if (rol === 'GERENTE') {
    const branchIds = session.user.zonaBranchIds?.length
      ? session.user.zonaBranchIds
      : branchId ? [branchId] : null
    if (branchIds?.length) loanWhere.branchId = { in: branchIds }
  } else if (rol === 'GERENTE_ZONAL') {
    const zoneIds = session.user.zonaBranchIds
    if (zoneIds?.length) loanWhere.branchId = { in: zoneIds }
  }

  const grupo = await prisma.loanGroup.findFirst({
    where: {
      id: params.groupId,
      loans: { some: loanWhere },
    },
    include: {
      loans: {
        where: { tipo: 'SOLIDARIO', ...loanWhere },
        orderBy: { createdAt: 'asc' },
        include: {
          client:   { select: { id: true, nombreCompleto: true } },
          schedule: { orderBy: { numeroPago: 'asc' } },
          loanRenovado: {
            where: { estado: { in: ['PENDING_APPROVAL', 'APPROVED'] } },
            select: { id: true },
          },
        },
      },
    },
  })

  if (!grupo) notFound()

  const totalPagos   = grupo.loans.flatMap((l) => l.schedule).length
  const totalPagados = grupo.loans.flatMap((l) => l.schedule).filter((s) => s.estado === 'PAID').length

  // ── Eligibilidad de renovación grupal anticipada ──────────────────────
  const activeLoans = grupo.loans.filter((l) => l.estado === 'ACTIVE')
  const allEligible =
    activeLoans.length > 0 &&
    activeLoans.every((l) => {
      const pagados = l.schedule.filter((s) => s.estado === 'PAID').length
      return pagados >= SOLIDARIO_UMBRAL && l.loanRenovado.length === 0
    })

  const canRenewGroup = allEligible && ROLES_PUEDEN_RENOVAR.includes(rol)

  const memberRenewalData = canRenewGroup
    ? activeLoans.map((l) => {
        const pagosPendientes = l.schedule.filter(
          (s) => s.estado === 'PENDING' || s.estado === 'OVERDUE' || s.estado === 'PARTIAL'
        )
        const montoFinanciado = pagosPendientes
          .slice(0, SOLIDARIO_PAGOS_FINANCIADOS)
          .reduce((sum, s) => sum + Number(s.montoEsperado), 0)
        return {
          loanId:               l.id,
          clientNombre:         l.client.nombreCompleto,
          currentCapital:       Number(l.capital),
          pagosFinanciadosCount: Math.min(SOLIDARIO_PAGOS_FINANCIADOS, pagosPendientes.length),
          montoFinanciado,
        }
      })
    : undefined

  // Calcular href de regreso según rol
  const loanBranchId = grupo.loans[0]?.branchId
  const backHref =
    rol === 'COORDINADOR' || rol === 'COBRADOR'
      ? '/cartera/mios/SOLIDARIO'
      : loanBranchId
      ? `/cartera/${loanBranchId}/SOLIDARIO`
      : '/prestamos'

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary-600 shrink-0" />
            <h1 className="text-2xl font-bold truncate">{grupo.nombre}</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            {grupo.loans.length} integrantes · {totalPagados}/{totalPagos} pagos realizados
          </p>
        </div>
      </div>

      <GrupoCalendar
        groupId={grupo.id}
        loans={grupo.loans.map((loan) => ({
          id:           loan.id,
          clientId:     loan.client.id,
          clientNombre: loan.client.nombreCompleto,
          schedule: loan.schedule.map((s) => ({
            id:               s.id,
            numeroPago:       s.numeroPago,
            fechaVencimiento: s.fechaVencimiento,
            montoEsperado:    Number(s.montoEsperado),
            montoPagado:      Number(s.montoPagado),
            estado:           s.estado,
            pagadoAt:         s.pagadoAt ?? null,
          })),
        }))}
        canActGroup={esOpAdmin || tienePermisoAplicar}
        canRenewGroup={canRenewGroup}
        memberRenewalData={memberRenewalData}
      />
    </div>
  )
}
