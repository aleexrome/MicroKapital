import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, Users, Banknote, DollarSign, TrendingUp, Wallet, PiggyBank } from 'lucide-react'
import { GrupoCalendar } from '@/components/loans/GrupoCalendar'
import { EditGroupNameButton } from '@/components/loans/EditGroupNameButton'
import { canViewInterestData } from '@/lib/access'
import { formatMoney } from '@/lib/utils'
import { type Prisma } from '@prisma/client'
import { tienePrestamosEnLimbo72h } from '@/lib/limbo-status'

const SOLIDARIO_UMBRAL             = 6
const SOLIDARIO_PAGOS_FINANCIADOS  = 2
const ROLES_PUEDEN_RENOVAR = ['COORDINADOR', 'COBRADOR', 'GERENTE', 'GERENTE_ZONAL', 'SUPER_ADMIN']

export default async function GrupoCalendarioPage({ params }: { params: { groupId: string } }) {
  const session = await getSession()
  if (!session?.user) return null

  const { companyId, rol, branchId, id: userId } = session.user
  const esOpAdmin = rol === 'DIRECTOR_GENERAL' || rol === 'DIRECTOR_COMERCIAL' || rol === 'SUPER_ADMIN'
  // Usuarios con permiso especial pueden actuar en grupos de su propia sucursal
  const tienePermisoAplicar = session.user.permisoAplicarPagos === true
  const rolCobra = rol === 'COORDINADOR' || rol === 'COBRADOR' || rol === 'GERENTE' || rol === 'GERENTE_ZONAL'
  const puedeCapturarGrupal = rolCobra && !esOpAdmin && !tienePermisoAplicar

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
          // Cargamos también las renovaciones que YA están ACTIVE para
          // poder detectar préstamos del ciclo viejo (incluso si por algún
          // bug viejo el original no quedó marcado como LIQUIDATED).
          loanRenovado: {
            where: { estado: { in: ['PENDING_APPROVAL', 'APPROVED', 'IN_ACTIVATION', 'ACTIVE'] } },
            select: { id: true, estado: true },
          },
        },
      },
    },
  })

  if (!grupo) notFound()

  // "Ciclo vigente" del grupo: préstamos ACTIVE/DEFAULTED del ciclo más
  // nuevo. Se excluyen:
  //   1. Préstamos LIQUIDATED y demás estados terminales.
  //   2. Préstamos cuya renovación YA está ACTIVE — significa que son del
  //      ciclo viejo aunque por algún bug histórico su estado siga ACTIVE
  //      (caso reportado: grupos donde el original no quedó LIQUIDATED).
  const loansVigentes = grupo.loans.filter((loan) => {
    if (loan.estado !== 'ACTIVE' && loan.estado !== 'DEFAULTED') return false
    const tieneRenovacionActiva = loan.loanRenovado.some((r) => r.estado === 'ACTIVE')
    return !tieneRenovacionActiva
  })

  // Pagos grupales: N de plazo, contando pagos donde todos los integrantes
  // pagaron. FINANCIADO también cuenta como "cerrado" porque la renovación
  // absorbió esa cuota.
  const plazo = loansVigentes[0]?.schedule.length ?? grupo.loans[0]?.schedule.length ?? 0
  const loansParaConteo = loansVigentes.length > 0 ? loansVigentes : grupo.loans
  const pagosCompletos = plazo > 0
    ? Array.from({ length: plazo }, (_, i) => i + 1).filter((num) =>
        loansParaConteo.every((l) => {
          const s = l.schedule.find((x) => x.numeroPago === num)
          return s?.estado === 'PAID' || s?.estado === 'ADVANCE' || s?.estado === 'FINANCIADO'
        })
      ).length
    : 0

  // ── Eligibilidad de renovación grupal anticipada ──────────────────────
  const activeLoans = grupo.loans.filter((l) => l.estado === 'ACTIVE')
  const allEligible =
    activeLoans.length > 0 &&
    activeLoans.every((l) => {
      const pagados = l.schedule.filter((s) => s.estado === 'PAID').length
      return pagados >= SOLIDARIO_UMBRAL && l.loanRenovado.length === 0
    })

  const canRenewGroup = allEligible && ROLES_PUEDEN_RENOVAR.includes(rol)

  // Anti-fraude: verificar limbo del usuario actual para deshabilitar
  // "Solicitar renovación grupal".
  const limboCheck = (rol === 'COORDINADOR' || rol === 'COBRADOR' || rol === 'GERENTE' || rol === 'GERENTE_ZONAL')
    ? await tienePrestamosEnLimbo72h(userId, prisma)
    : { bloqueado: false, prestamosEnLimbo: [] }

  const memberRenewalData = canRenewGroup
    ? activeLoans.map((l) => {
        const pagosPendientes = l.schedule.filter(
          (s) => s.estado === 'PENDING' || s.estado === 'PARTIAL'
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

  // ── PaymentInfoMap (quién/cuándo registró cada pago) — solo DG/DC/SA ───
  // Se construye por scheduleId y se pasa a GrupoCalendar para mostrar
  // el ícono "i" en cada fila pagada.
  type PaymentInfo = { quien: string; rol: string; cuando: string }
  const paymentInfoMap: Record<string, PaymentInfo> = {}

  if (canViewInterestData(rol) && grupo.loans.length > 0) {
    const scheduleIds = grupo.loans.flatMap((l) => l.schedule.map((s) => s.id))

    if (scheduleIds.length > 0) {
      // Audit primero (refleja quién dio click en Aplicar — DG/DC/Cristina)
      const audits = await prisma.auditLog.findMany({
        where: {
          accion: { in: ['DG_APPLY_PAYMENT', 'DG_APPLY_PAYMENT_GRUPO'] },
          registroId: { in: scheduleIds },
        },
        select: {
          registroId: true,
          createdAt: true,
          user: { select: { nombre: true, rol: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
      for (const a of audits) {
        if (a.registroId && !paymentInfoMap[a.registroId] && a.user) {
          paymentInfoMap[a.registroId] = {
            quien: a.user.nombre,
            rol: a.user.rol,
            cuando: a.createdAt.toISOString(),
          }
        }
      }

      // Pagos capturados normalmente — fallback si no hay audit
      const pagosInfo = await prisma.payment.findMany({
        where: { scheduleId: { in: scheduleIds } },
        select: {
          scheduleId: true,
          fechaHora: true,
          cobrador: { select: { nombre: true, rol: true } },
        },
        orderBy: { fechaHora: 'desc' },
      })
      for (const p of pagosInfo) {
        if (p.scheduleId && !paymentInfoMap[p.scheduleId]) {
          paymentInfoMap[p.scheduleId] = {
            quien: p.cobrador.nombre,
            rol: p.cobrador.rol,
            cuando: p.fechaHora.toISOString(),
          }
        }
      }
    }
  }

  // ── Resumen financiero del grupo (solo DG/DC/SA) ────────────────────
  // Se calcula sobre los loans del ciclo vigente para reflejar el ciclo
  // activo y no arrastrar dinero de ciclos anteriores ya liquidados.
  //   - totalPrestado = suma de capital que salió a los integrantes.
  //   - totalARecuperar = suma de lo que el grupo debe pagar en total
  //     (capital + interés + comisión), o sea Σ totalPago.
  //   - gananciaMK = totalARecuperar - totalPrestado (interés + comisión).
  //   - cobrado = todo lo que ya entró a caja por payments capturados,
  //     leído desde schedule.montoPagado (respeta multipagos parciales).
  //   - porCobrar = lo que falta para llegar a totalARecuperar.
  const mostrarResumenFinanciero = rol === 'DIRECTOR_GENERAL'
    || rol === 'DIRECTOR_COMERCIAL'
    || rol === 'SUPER_ADMIN'
  const totalPrestado = loansVigentes.reduce((s, l) => s + Number(l.capital), 0)
  const totalARecuperar = loansVigentes.reduce((s, l) => s + Number(l.totalPago), 0)
  const gananciaMK = totalARecuperar - totalPrestado
  const totalCobrado = loansVigentes.reduce(
    (s, l) => s + l.schedule.reduce((acc, sc) => acc + Number(sc.montoPagado), 0),
    0,
  )
  const porCobrar = Math.max(0, totalARecuperar - totalCobrado)
  const pctCobrado = totalARecuperar > 0
    ? Math.round((totalCobrado / totalARecuperar) * 100)
    : 0

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
      <div className="flex items-center gap-3 flex-wrap">
        <Button asChild variant="ghost" size="icon">
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary-600 shrink-0" />
            <h1 className="text-2xl font-bold truncate">{grupo.nombre}</h1>
            {esOpAdmin && (
              <EditGroupNameButton
                groupId={grupo.id}
                currentName={grupo.nombre}
                iconSize={16}
              />
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            {grupo.loans.length} integrantes · {pagosCompletos}/{plazo} pagos realizados
          </p>
        </div>
        {/* Botón de captura grupal — solo para roles que cobran (no DG/DC/usuarios con permiso aplicar) */}
        {puedeCapturarGrupal && (
          <Button asChild size="sm">
            <Link href={`/cobros/grupo/${grupo.id}/capturar`}>
              <Banknote className="h-4 w-4 mr-1" />Capturar pago grupal
            </Link>
          </Button>
        )}
      </div>

      {/* ── Resumen financiero — solo Direccion ─────────────────────── */}
      {mostrarResumenFinanciero && (
        <Card>
          <CardContent className="p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary-600" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Resumen financiero del grupo
              </h2>
            </div>

            {/* Los 2 numeros clave que pidio DG: prestado y a recuperar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl bg-blue-500/5 border border-blue-500/20 p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Wallet className="h-3.5 w-3.5 text-blue-500" />
                  Total prestado al grupo
                </div>
                <p className="text-2xl font-bold text-blue-600 money mt-1">
                  {formatMoney(totalPrestado)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Capital que salio a los integrantes
                </p>
              </div>
              <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                  Total a recuperar por MicroKapital
                </div>
                <p className="text-2xl font-bold text-emerald-600 money mt-1">
                  {formatMoney(totalARecuperar)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Capital + interes + comision
                </p>
              </div>
            </div>

            {/* Segunda fila: ganancia, cobrado, por cobrar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <PiggyBank className="h-3.5 w-3.5 text-primary-500" />
                  Ganancia estimada
                </div>
                <p className="text-lg font-semibold money mt-0.5">
                  {formatMoney(gananciaMK)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Cobrado a la fecha</p>
                <p className="text-lg font-semibold text-emerald-600 money mt-0.5">
                  {formatMoney(totalCobrado)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {pctCobrado}% del total
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Por cobrar</p>
                <p className="text-lg font-semibold text-amber-600 money mt-0.5">
                  {formatMoney(porCobrar)}
                </p>
              </div>
            </div>

            {/* Barra de progreso de la cobranza vs total a recuperar */}
            <div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${Math.min(100, pctCobrado)}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <GrupoCalendar
        groupId={grupo.id}
        loans={loansVigentes
          .map((loan) => ({
          id:           loan.id,
          clientId:     loan.client.id,
          clientNombre: loan.client.nombreCompleto,
          capital:      Number(loan.capital),
          pagoSemanal:  loan.pagoSemanal !== null ? Number(loan.pagoSemanal) : null,
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
        bloqueoLimbo={
          limboCheck.bloqueado
            ? { bloqueado: true, prestamosCount: limboCheck.prestamosEnLimbo.length }
            : undefined
        }
        memberRenewalData={memberRenewalData}
        paymentInfoMap={paymentInfoMap}
      />
    </div>
  )
}
