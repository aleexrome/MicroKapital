export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { loanNotDeletedWhere } from '@/lib/access'
import { isOverdue } from '@/lib/schedule'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatMoney } from '@/lib/utils'
import {
  ArrowLeft, TrendingUp, Target, CheckCircle2, Clock, AlertCircle,
  CircleDot, Building2, User,
} from 'lucide-react'
import {
  idToSaturday, getFriday, formatWeekLabelSatFri, getSaturday,
} from '@/lib/week-utils'
import {
  ImprimirRutaButton,
  type RutaCobroRow, type RutaColocacionRow,
} from '@/components/rutas/ImprimirRutaButton'
import {
  GERENTES_AGREGADOS_POR_SUCURSAL,
  metaColocacion,
} from '@/lib/cobranza-semanal'
import type { ScheduleStatus, Prisma } from '@prisma/client'

// ── helpers ──────────────────────────────────────────────────────────────

function calcPct(a: number, b: number) {
  return b > 0 ? Math.round((a / b) * 100) : 0
}

function barColor(p: number, type: 'cobranza' | 'meta') {
  if (type === 'cobranza') {
    if (p >= 90) return 'bg-green-500'
    if (p >= 70) return 'bg-emerald-400'
    if (p >= 50) return 'bg-amber-400'
    return 'bg-red-400'
  }
  if (p >= 100) return 'bg-indigo-500'
  if (p >= 70)  return 'bg-violet-500'
  if (p >= 40)  return 'bg-violet-400'
  return 'bg-gray-400'
}

function textColor(p: number, type: 'cobranza' | 'meta') {
  if (type === 'cobranza') {
    if (p >= 90) return 'text-green-600'
    if (p >= 70) return 'text-emerald-600'
    if (p >= 50) return 'text-amber-600'
    return 'text-red-500'
  }
  if (p >= 100) return 'text-indigo-600'
  if (p >= 70)  return 'text-violet-600'
  return 'text-gray-500'
}

// La cobranza efectiva se calcula sumando los Payment reales asociados a
// cada schedule de la semana. Antes se sumaba `montoEsperado` cuando el
// schedule estaba marcado PAID/ADVANCE — eso permitía que un schedule sin
// movimiento real (renovaciones liquidadas como FINANCIADO antes del fix,
// pagos aplicados sin Payment, etc.) inflara el indicador. Ahora un
// schedule solo aporta lo que esté respaldado por Payment.monto, capeado
// al monto esperado para no dejar que sobre-pagos eleven el porcentaje
// (los excedentes pertenecen al schedule siguiente como ADVANCE).
function calcCobranza(
  schedules: Array<{
    estado: string
    montoEsperado: Prisma.Decimal
    payments: Array<{ monto: Prisma.Decimal }>
  }>
) {
  // Schedules pre-pagados (PAID/ADVANCE pero con `payments` vacío después
  // del filtro por fechaHora de esta semana) son cobros que ya entraron en
  // semanas anteriores — típicamente cuando el cliente pagó por adelantado
  // o cuando una renovación absorbió pagos del crédito viejo. No cuentan
  // ni en totalAPagar (no hay nada que cobrar esta semana) ni en cobrado.
  const activos = schedules.filter((r) => {
    const sinPaymentEstaSemana = r.payments.length === 0
    const yaCobradoAntes = r.estado === 'PAID' || r.estado === 'ADVANCE'
    return !(sinPaymentEstaSemana && yaCobradoAntes)
  })
  const totalAPagar = activos.reduce((s, r) => s + r.montoEsperado.toNumber(), 0)
  const totalCobrado = activos.reduce((s, r) => {
    const paid = r.payments.reduce((acc, p) => acc + p.monto.toNumber(), 0)
    return s + Math.min(paid, r.montoEsperado.toNumber())
  }, 0)
  const cobradosCount = activos.filter((r) => r.payments.length > 0).length
  const scheduleCount = activos.length
  return { totalAPagar, totalCobrado, cobradosCount, scheduleCount }
}

/**
 * Consolida cobranza + colocación en un solo objeto con los % ya
 * calculados. Se usa para armar las dos secciones (propia / heredada)
 * de la tarjeta del coordinador sin repetir la aritmética en cada
 * lugar.
 */
function buildPairStats(
  schedules: Parameters<typeof calcCobranza>[0],
  loans: Array<{ capital: Prisma.Decimal | number }>,
) {
  const { totalAPagar, totalCobrado, cobradosCount, scheduleCount } = calcCobranza(schedules)
  const colocacion = loans.reduce((s, l) => s + Number(l.capital), 0)
  const metaTarget = metaColocacion(totalAPagar)
  return {
    totalAPagar,
    totalCobrado,
    cobradosCount,
    scheduleCount,
    colocacion,
    metaTarget,
    cobranzaPct: calcPct(totalCobrado, totalAPagar),
    metaPct:     calcPct(colocacion, metaTarget),
  }
}

// ── status icon ───────────────────────────────────────────────────────────

// Estado visual basado en lo que efectivamente cobramos (Payment.monto),
// no en el campo `estado` del schedule. Así la fila siempre concuerda con
// el KPI superior.
function StatusIcon({
  schedule,
  paidAmount,
}: {
  schedule: { estado: ScheduleStatus | string; fechaVencimiento: Date | string; montoEsperado: Prisma.Decimal }
  paidAmount: number
}) {
  const expected = schedule.montoEsperado.toNumber()
  if (paidAmount >= expected) return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
  if (paidAmount > 0)         return <CircleDot className="h-4 w-4 text-amber-500 shrink-0" />
  if (isOverdue(schedule as { estado: ScheduleStatus; fechaVencimiento: Date | string })) {
    return <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
  }
  return <Clock className="h-4 w-4 text-gray-400 shrink-0" />
}

const ESTADO_LABEL: Record<string, string> = {
  PAID: 'Cobrado', ADVANCE: 'Cobrado', PARTIAL: 'Parcial',
  PENDING: 'Pendiente', OVERDUE: 'Vencido',
}
const TIPO_LABEL: Record<string, string> = {
  SOLIDARIO: 'Solidario', INDIVIDUAL: 'Individual',
  AGIL: 'Ágil', FIDUCIARIO: 'Fiduciario',
}

// Dom=0, Lun=1, ..., Sáb=6
const DIAS_ES_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const DIAS_ES_LARGOS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

/**
 * Chip row para filtrar la ruta por día (Sáb → Vie). Cuando ninguna
 * está activa se ve la semana completa (comportamiento por defecto);
 * al hacer click en un día, la lista y el print se limitan a ese día.
 * "Toda la semana" resetea el filtro.
 */
function DayFilterChips({
  dias,
  active,
  basePath,
  preserveU,
}: {
  dias: Date[]
  active: string | null
  basePath: string
  preserveU: string | null
}) {
  const buildHref = (d: string | null) => {
    const params = new URLSearchParams()
    if (preserveU) params.set('u', preserveU)
    if (d) params.set('d', d)
    const qs = params.toString()
    return qs ? `${basePath}?${qs}` : basePath
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-muted-foreground mr-1">Filtrar por día:</span>
      <Link
        href={buildHref(null)}
        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
          active === null
            ? 'bg-orange-500 text-white border border-orange-500 shadow-sm'
            : 'bg-transparent text-orange-600 border border-orange-500 hover:bg-orange-500/10'
        }`}
      >
        Toda la semana
      </Link>
      {dias.map((d) => {
        const key = d.toISOString().slice(0, 10)
        const isActive = active === key
        const dia = DIAS_ES_CORTOS[d.getUTCDay()]
        const num = d.getUTCDate()
        return (
          <Link
            key={key}
            href={buildHref(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              isActive
                ? 'bg-orange-500 text-white border border-orange-500 shadow-sm'
                : 'bg-transparent text-orange-600 border border-orange-500 hover:bg-orange-500/10'
            }`}
          >
            {dia} {String(num).padStart(2, '0')}
          </Link>
        )
      })}
    </div>
  )
}

// ── KPI card component (server-side) ─────────────────────────────────────

function KpiCard({
  label, sublabel, pctValue, actual, target, type,
}: {
  label: string
  sublabel?: string
  pctValue: number
  actual: number
  target: number
  type: 'cobranza' | 'meta'
}) {
  const bc = barColor(pctValue, type)
  const tc = textColor(pctValue, type)
  const targetLabel = type === 'meta' ? 'meta' : 'total'
  return (
    <div className="bg-white rounded-xl border shadow-sm p-5 flex-1">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      {sublabel && <p className="text-[11px] text-muted-foreground">{sublabel}</p>}
      <p className={`text-5xl font-black mt-2 mb-4 ${tc}`}>{pctValue}%</p>
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-2">
        <div className={`h-full ${bc} rounded-full transition-all`} style={{ width: `${Math.min(100, pctValue)}%` }} />
      </div>
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-gray-700">{formatMoney(actual)}</span>
        {' '}<span className="text-gray-400">de</span>{' '}
        <span className="font-medium text-gray-700">{formatMoney(target)}</span>
        {' '}{targetLabel}
      </p>
    </div>
  )
}

// ── small coordinator stat card ──────────────────────────────────────────

/**
 * Sub-bloque Cobranza + Colocación. Se usa tanto para "Su cartera" como
 * para "Cartera heredada". Se extrajo para poder pintarlos apilados
 * cuando el coordinador tiene ambas fuentes.
 */
function CobradorMetricPair({
  totalCobrado, totalAPagar, cobranzaPct,
  colocacion, metaTarget, metaPct,
}: {
  totalCobrado: number
  totalAPagar: number
  cobranzaPct: number
  colocacion: number
  metaTarget: number
  metaPct: number
}) {
  const cbBar = barColor(cobranzaPct, 'cobranza')
  const mtBar = barColor(metaPct, 'meta')
  const cbText = textColor(cobranzaPct, 'cobranza')
  const mtText = textColor(metaPct, 'meta')
  const colocacionSinMeta = metaTarget === 0 && colocacion > 0

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">Cobranza</span>
          <span className={`text-sm font-bold ${cbText}`}>{cobranzaPct}%</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full ${cbBar} rounded-full`} style={{ width: `${Math.min(100, cobranzaPct)}%` }} />
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">{formatMoney(totalCobrado)} / {formatMoney(totalAPagar)}</p>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">Colocación</span>
          <span className={`text-sm font-bold ${colocacionSinMeta ? 'text-emerald-600' : mtText}`}>
            {colocacionSinMeta ? '—' : `${metaPct}%`}
          </span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full ${colocacionSinMeta ? 'bg-emerald-500' : mtBar} rounded-full`}
            style={{ width: colocacionSinMeta ? '100%' : `${Math.min(100, metaPct)}%` }}
          />
        </div>
        {colocacionSinMeta ? (
          <p className="text-[11px] text-muted-foreground mt-1">
            <span className="font-semibold text-emerald-600 money">{formatMoney(colocacion)}</span> colocados · sin meta esta semana
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground mt-1">{formatMoney(colocacion)} / {formatMoney(metaTarget)}</p>
        )}
      </div>
    </div>
  )
}

interface CobradorPairStats {
  totalCobrado: number
  totalAPagar: number
  cobranzaPct: number
  colocacion: number
  metaTarget: number
  metaPct: number
  cobradosCount: number
  scheduleCount: number
}

function CobradorCard({
  nombre, rolLabel, propia, heredada, cobradosCount, scheduleCount,
}: {
  nombre: string
  rolLabel: string
  propia: CobradorPairStats
  /** Si el coord tiene clientes heredados y hay actividad esta semana en
   *  ellos, se pinta un bloque adicional. Null si no aplica. */
  heredada: CobradorPairStats | null
  /** Contadores combinados (propia + heredada) para el encabezado. */
  cobradosCount: number
  scheduleCount: number
}) {
  return (
    <div className="bg-white border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="font-semibold text-gray-900 text-sm">{nombre}</p>
            <p className="text-xs text-muted-foreground">{rolLabel}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{cobradosCount}/{scheduleCount} cobros</p>
      </div>

      {heredada ? (
        <>
          <div>
            <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Su cartera</p>
            <CobradorMetricPair {...propia} />
          </div>
          <div className="pt-2 border-t border-dashed border-border/50">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Cartera heredada</p>
              <span className="text-[10px] rounded px-1.5 py-0.5 border border-violet-400/50 text-violet-400 bg-violet-500/10 font-medium">
                Heredada
              </span>
            </div>
            <CobradorMetricPair {...heredada} />
          </div>
        </>
      ) : (
        <CobradorMetricPair {...propia} />
      )}
    </div>
  )
}

// ── page ──────────────────────────────────────────────────────────────────

export default async function RutaDetallePage({
  params,
  searchParams,
}: {
  params: { semana: string }
  searchParams: { u?: string; d?: string }
}) {
  const session = await getSession()
  if (!session?.user) return null

  const { id: userId, rol, companyId, branchId } = session.user

  // Parse and validate week (Sábado–Viernes)
  const saturday = idToSaturday(params.semana)
  if (isNaN(saturday.getTime())) notFound()
  // Reject dates that aren't a Saturday
  if (saturday.getUTCDay() !== 6) notFound()

  const friday = getFriday(saturday)
  const weekLabel = formatWeekLabelSatFri(saturday)
  const isCurrentWeek = saturday.getTime() === getSaturday(new Date()).getTime()

  const isCoordinador = rol === 'COORDINADOR' || rol === 'COBRADOR'
  const isGerente     = rol === 'GERENTE' || rol === 'GERENTE_ZONAL'
  // DIRECTOR_COMERCIAL se sumó al grupo que ve todas las sucursales. Antes
  // quedaba sin vista alguna y caía en el `return null` del final.
  const isDG          = rol === 'DIRECTOR_GENERAL' || rol === 'DIRECTOR_COMERCIAL' || rol === 'SUPER_ADMIN'

  // ── Drill-down: Gerente/DG abrió la ficha detallada de un cobrador ───────
  // Si llega ?u=<userId> y el rol tiene permiso, renderizamos la vista
  // COORDINADOR (detalle con cobros y colocaciones) usando los datos de
  // ese usuario. Validamos que el target esté dentro del alcance del caller:
  //   - Gerente/Gerente Zonal: solo usuarios de su(s) sucursal(es).
  //   - Director/Super Admin: cualquier usuario de la empresa.
  let targetUserId: string = userId
  let targetUserName: string = session.user.name ?? 'Mi ruta'
  let targetBranchId: string | null = branchId ?? null
  // zonaBranchIds del usuario destino — para gerentes con varias sucursales
  // (ej. Héctor: Toluca + San Mateo Atenco) la ruta agregada cubre TODAS.
  let targetZonaBranchIds: string[] = (session.user.zonaBranchIds as string[] | null)?.length
    ? (session.user.zonaBranchIds as string[])
    : []
  let isDrillDown = false
  if (searchParams?.u && (isGerente || isDG)) {
    const target = await prisma.user.findFirst({
      where: { id: searchParams.u, companyId: companyId!, activo: true },
      select: { id: true, nombre: true, branchId: true, zonaBranchIds: true },
    })
    if (target) {
      let allowed = false
      if (isGerente) {
        const branchIds = (session.user.zonaBranchIds as string[] | null)?.length
          ? (session.user.zonaBranchIds as string[])
          : branchId ? [branchId] : []
        allowed = !!target.branchId && branchIds.includes(target.branchId)
      } else {
        allowed = true // DG/DC/SA ven toda la empresa
      }
      if (allowed) {
        targetUserId   = target.id
        targetUserName = target.nombre
        targetBranchId = target.branchId ?? null
        targetZonaBranchIds = Array.isArray(target.zonaBranchIds) ? (target.zonaBranchIds as string[]) : []
        isDrillDown    = true
      }
    }
  }

  // Para los gerentes sin cartera propia, la vista detallada muestra
  // todos los pagos y colocaciones de su sucursal en lugar de su ruta
  // personal (que está vacía y daría 0% / $0). Aplica tanto cuando ellos
  // mismos abren su /rutas como cuando alguien hace drill-down a su ficha.
  const aggregateByBranch =
    GERENTES_AGREGADOS_POR_SUCURSAL.has(targetUserId) && (!!targetBranchId || targetZonaBranchIds.length > 0)

  // Lista efectiva de sucursales a agregar: si el gerente tiene
  // zonaBranchIds (varias sucursales asignadas), agregamos todas; si no,
  // sólo la sucursal individual. Antes sólo se usaba targetBranchId y por
  // eso un gerente de 2 sucursales (ej. Toluca + San Mateo Atenco) sólo
  // veía la cobranza de UNA.
  const targetBranchIds: string[] =
    targetZonaBranchIds.length > 0
      ? targetZonaBranchIds
      : targetBranchId
        ? [targetBranchId]
        : []

  // ── COORDINADOR / COBRADOR view ─────────────────────────────────────
  // También usada en modo drill-down: cuando un Gerente o Director entra
  // con ?u=<userId>, renderizamos esta misma vista pero con los datos del
  // usuario seleccionado.
  if (isCoordinador || isDrillDown) {
    // Para gerentes sin cartera propia el filtro pasa de cobradorId a
    // branchId — así la "ruta" del gerente refleja todas sus sucursales
    // (puede tener una o varias en zonaBranchIds).
    const loanFilterBase = aggregateByBranch && targetBranchIds.length > 0
      ? { branchId: { in: targetBranchIds } }
      : { cobradorId: targetUserId }

    const [schedules, loans] = await Promise.all([
      prisma.paymentSchedule.findMany({
        where: {
          fechaVencimiento: { gte: saturday, lte: friday },
          estado: { not: 'FINANCIADO' },
          loan: {
            ...loanFilterBase,
            companyId: companyId!,
            estado: { in: ['ACTIVE', 'LIQUIDATED', 'DEFAULTED'] },
            AND: [loanNotDeletedWhere],
          },
        },
        select: {
          id: true,
          numeroPago: true,
          montoEsperado: true,
          montoPagado:   true,
          estado:        true,
          fechaVencimiento: true,
          // Filtro por fechaHora: solo Payments hechos DENTRO de la semana
          // del reporte. Antes traíamos todos los Payments del schedule y
          // un cobro hecho en semana anterior (típico de renovación que
          // absorbió el pago) inflaba la cobranza efectiva de esta semana.
          payments: {
            where: { fechaHora: { gte: saturday, lte: friday } },
            select: { monto: true },
          },
          loan: {
            select: {
              tipo: true,
              client: { select: { nombreCompleto: true } },
              loanGroup: { select: { nombre: true } },
            },
          },
        },
        orderBy: [{ fechaVencimiento: 'asc' }, { id: 'asc' }],
      }),
      prisma.loan.findMany({
        where: {
          ...loanFilterBase,
          companyId: companyId!,
          estado: { in: ['ACTIVE', 'LIQUIDATED'] },
          fechaDesembolso: { gte: saturday, lte: friday },
          AND: [loanNotDeletedWhere],
        },
        select: {
          id: true,
          capital: true,
          tipo: true,
          fechaDesembolso: true,
          loanOriginalId: true,
          client: { select: { nombreCompleto: true } },
        },
        orderBy: { fechaDesembolso: 'asc' },
      }),
    ])

    // ── Filtro opcional por día (?d=YYYY-MM-DD) ─────────────────────────
    // Filtra tanto la lista visible como el print. Si no viene o cae fuera
    // de la semana Sáb–Vie, se ignora y la vista queda "completa" — que es
    // el comportamiento por defecto que ya conocemos.
    const daysOfWeek = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(saturday)
      d.setUTCDate(d.getUTCDate() + i)
      return d
    })
    const toDayKey = (d: Date) => d.toISOString().slice(0, 10)
    const validDayKeys = new Set(daysOfWeek.map(toDayKey))
    const dayFilter = searchParams?.d && validDayKeys.has(searchParams.d)
      ? searchParams.d
      : null
    const filteredSchedules = dayFilter
      ? schedules.filter((s) => toDayKey(new Date(s.fechaVencimiento)) === dayFilter)
      : schedules
    const filteredLoans = dayFilter
      ? loans.filter((l) => l.fechaDesembolso && toDayKey(new Date(l.fechaDesembolso)) === dayFilter)
      : loans

    const { totalAPagar, totalCobrado, cobradosCount, scheduleCount: pactadosCount } = calcCobranza(filteredSchedules)
    const colocacion = filteredLoans.reduce((s, l) => s + Number(l.capital), 0)
    const metaTarget = metaColocacion(totalAPagar)
    const cobranzaPct = calcPct(totalCobrado, totalAPagar)
    const metaPct     = calcPct(colocacion, metaTarget)

    // ── Build print data ────────────────────────────────────────────────
    // El monto cobrado por fila viene de los Payment reales — ver
    // calcCobranza arriba para la justificación.
    const printCobros: RutaCobroRow[] = filteredSchedules.map((s) => {
      const paid = s.payments.reduce((acc, p) => acc + Number(p.monto), 0)
      const montoCobrado = Math.min(paid, Number(s.montoEsperado))
      // prePagado: schedule está PAID/ADVANCE (cobro registrado en algún
      // momento) pero no hay Payments dentro de esta semana — significa
      // que el cobro fue en una semana anterior (renovación absorbida o
      // cobro anticipado). El badge "Pre-pagado" avisa a la cobradora que
      // no debe visitar al cliente, sin contarlo como cobranza efectiva
      // de esta semana.
      const prePagado = (s.estado === 'PAID' || s.estado === 'ADVANCE') && s.payments.length === 0
      return {
        clientNombre:  s.loan.client.nombreCompleto,
        tipo:          s.loan.tipo,
        numeroPago:    s.numeroPago,
        // ISO string para que el componente formatee fecha+día sin caer
        // en sorpresas de zona horaria del navegador.
        fechaVencimiento: new Date(s.fechaVencimiento).toISOString(),
        montoEsperado: Number(s.montoEsperado),
        montoCobrado,
        estado:        s.estado,
        prePagado,
        nombreGrupo:   s.loan.loanGroup?.nombre ?? null,
      }
    })
    const printColocaciones: RutaColocacionRow[] = filteredLoans.map((l) => ({
      clientNombre: l.client.nombreCompleto,
      tipo:         l.tipo,
      esRenovacion: !!l.loanOriginalId,
      capital:      Number(l.capital),
    }))

    // En drill-down el "atrás" vuelve al resumen de la semana (sin ?u),
    // no al listado de semanas, para que el Gerente/Director no pierda
    // el contexto de la semana que estaba revisando.
    const backHref = isDrillDown ? `/rutas/${params.semana}` : '/rutas'

    return (
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href={backHref}><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">
                {isDrillDown ? `Ruta — ${targetUserName}` : 'Ruta semanal'}
              </h1>
              {isCurrentWeek && (
                <span className="text-[10px] font-bold uppercase tracking-wide bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">
                  En curso
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{weekLabel}</p>
          </div>
        </div>

        {/* KPI top section */}
        <div className="flex flex-col sm:flex-row gap-4">
          <KpiCard
            label="Cobranza Efectiva"
            sublabel={`${cobradosCount} cobrados de ${pactadosCount} pactados`}
            pctValue={cobranzaPct}
            actual={totalCobrado}
            target={totalAPagar}
            type="cobranza"
          />
          <KpiCard
            label="Meta de Colocación"
            sublabel="70% del total pactado"
            pctValue={metaPct}
            actual={colocacion}
            target={metaTarget}
            type="meta"
          />
        </div>

        {/* Day filter chips — opcional */}
        {schedules.length > 0 && (
          <DayFilterChips
            dias={daysOfWeek}
            active={dayFilter}
            basePath={`/rutas/${params.semana}`}
            preserveU={isDrillDown ? targetUserId : null}
          />
        )}

        {/* Schedule list */}
        <div>
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-primary-600" />
            {dayFilter ? 'Cobros del día' : 'Cobros de la semana'}
            {pactadosCount > 0 && (
              <span className="text-sm font-normal text-muted-foreground">({pactadosCount} pactados)</span>
            )}
          </h2>
          {filteredSchedules.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center border rounded-lg">
              {dayFilter ? 'Sin cobros pactados este día' : 'Sin cobros pactados esta semana'}
            </p>
          ) : (
            <div className="border rounded-xl overflow-hidden divide-y bg-white">
              {filteredSchedules.map((s) => {
                // El indicador visual también deriva de los Payment reales,
                // para que la lista refleje la misma verdad que el KPI.
                const paid = s.payments.reduce((acc, p) => acc + Number(p.monto), 0)
                const expected = Number(s.montoEsperado)
                const isCobrado = paid >= expected
                const isPartial = !isCobrado && paid > 0
                // Pre-pagado: schedule estaba PAID/ADVANCE de antes pero el
                // Payment fue de semana previa (renovación absorbida o cobro
                // anticipado). NO debe mostrarse como cobrado de esta semana.
                const isPrePagado = !isCobrado && !isPartial && (s.estado === 'PAID' || s.estado === 'ADVANCE')
                const montoCobrado = Math.min(paid, expected)
                return (
                  <div
                    key={s.id}
                    className={`flex items-center gap-3 px-4 py-3 text-sm ${isCobrado || isPrePagado ? 'opacity-60' : ''}`}
                  >
                    <StatusIcon schedule={s} paidAmount={paid} />
                    <span className="flex-1 min-w-0 truncate font-medium">{s.loan.client.nombreCompleto}</span>
                    <Badge variant="outline" className="text-xs shrink-0">{TIPO_LABEL[s.loan.tipo] ?? s.loan.tipo}</Badge>
                    <span className="font-semibold w-20 text-right shrink-0">{formatMoney(expected)}</span>
                    <span className={`text-xs w-20 text-right shrink-0 ${isCobrado ? 'text-green-600 font-medium' : isPartial ? 'text-amber-600 font-medium' : isPrePagado ? 'italic text-muted-foreground' : 'text-muted-foreground'}`}>
                      {isCobrado || isPartial ? formatMoney(montoCobrado) : isPrePagado ? 'Pre-pagado' : ESTADO_LABEL[s.estado] ?? s.estado}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Colocación list */}
        <div>
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-primary-600" />
            {dayFilter ? 'Colocación del día' : 'Colocación de la semana'}
            {filteredLoans.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({filteredLoans.length} crédito{filteredLoans.length !== 1 ? 's' : ''} · {formatMoney(colocacion)})
              </span>
            )}
          </h2>
          {filteredLoans.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center border rounded-lg">
              {dayFilter ? 'Sin créditos colocados este día' : 'Sin créditos colocados esta semana'}
            </p>
          ) : (
            <div className="border rounded-xl overflow-hidden divide-y bg-white">
              {filteredLoans.map((l) => (
                <div key={l.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-indigo-500 shrink-0" />
                  <span className="flex-1 min-w-0 truncate font-medium">{l.client.nombreCompleto}</span>
                  <Badge variant="outline" className="text-xs shrink-0">{TIPO_LABEL[l.tipo] ?? l.tipo}</Badge>
                  <Badge
                    variant="outline"
                    className={`text-xs shrink-0 ${l.loanOriginalId ? 'border-violet-400 text-violet-700 bg-violet-50' : 'border-green-400 text-green-700 bg-green-50'}`}
                  >
                    {l.loanOriginalId ? 'Renovación' : 'Nuevo'}
                  </Badge>
                  <span className="font-semibold w-24 text-right shrink-0">{formatMoney(Number(l.capital))}</span>
                </div>
              ))}
            </div>
          )}
          {metaTarget > 0 && (
            <p className="text-xs text-muted-foreground mt-2 text-right">
              Meta: {formatMoney(metaTarget)} ({formatMoney(totalAPagar)} × 70%)
            </p>
          )}
        </div>

        {/* Botón imprimir — detalle por cliente */}
        <div className="flex justify-center pt-2">
          <ImprimirRutaButton
            weekLabel={
              dayFilter
                ? `${weekLabel} · ${DIAS_ES_LARGOS[new Date(dayFilter + 'T00:00:00Z').getUTCDay()]} ${dayFilter.split('-').reverse().join('/')}`
                : weekLabel
            }
            scopeLabel={targetUserName}
            cobros={printCobros}
            colocaciones={printColocaciones}
            totalAPagar={totalAPagar}
            totalCobrado={totalCobrado}
            colocacionTotal={colocacion}
            metaTarget={metaTarget}
            cobranzaPct={cobranzaPct}
            metaPct={metaPct}
          />
        </div>
      </div>
    )
  }

  // ── GERENTE / GERENTE_ZONAL view ──────────────────────────────────────
  if (isGerente) {
    const branchIds = (session.user.zonaBranchIds as string[] | null)?.length
      ? (session.user.zonaBranchIds as string[])
      : branchId ? [branchId] : []

    // 1. Get users in the branch
    const usuarios = await prisma.user.findMany({
      where: {
        companyId: companyId!,
        branchId: { in: branchIds },
        rol: { in: ['COORDINADOR', 'COBRADOR', 'GERENTE', 'GERENTE_ZONAL'] },
        activo: true,
      },
      select: { id: true, nombre: true, rol: true },
      orderBy: { nombre: 'asc' },
    })

    // Include gerente themselves if not already in list
    const allUsers = [...usuarios]
    if (!allUsers.find((u) => u.id === userId)) {
      const me = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, nombre: true, rol: true },
      })
      if (me) allUsers.unshift(me)
    }
    const allIds = allUsers.map((u) => u.id)

    // 2. Fetch schedule and loan data for those users
    const [wSchedules, wLoans] = await Promise.all([
      prisma.paymentSchedule.findMany({
        where: {
          fechaVencimiento: { gte: saturday, lte: friday },
          estado: { not: 'FINANCIADO' },
          loan: {
            cobradorId: { in: allIds },
            companyId: companyId!,
            estado: { in: ['ACTIVE', 'LIQUIDATED', 'DEFAULTED'] },
          },
        },
        select: {
          montoEsperado: true,
          montoPagado: true,
          estado: true,
          payments: {
            where: { fechaHora: { gte: saturday, lte: friday } },
            select: { monto: true },
          },
          loan: {
            select: {
              cobradorId: true,
              // heredadoDeId permite partir cobranza / colocación entre
              // "Su cartera" (heredadoDeId=null) y "Cartera heredada"
              // en la tarjeta del coordinador.
              client: { select: { heredadoDeId: true } },
            },
          },
        },
      }),
      prisma.loan.findMany({
        where: {
          cobradorId: { in: allIds },
          companyId: companyId!,
          estado: { in: ['ACTIVE', 'LIQUIDATED'] },
          fechaDesembolso: { gte: saturday, lte: friday },
          AND: [loanNotDeletedWhere],
        },
        select: {
          capital: true,
          cobradorId: true,
          client: { select: { heredadoDeId: true } },
        },
      }),
    ])

    // Aggregate stats per cobrador
    const ROL_LABEL_MAP: Record<string, string> = {
      COORDINADOR: 'Coordinador', COBRADOR: 'Cobrador',
      GERENTE: 'Gerente', GERENTE_ZONAL: 'Gerente Zonal',
    }

    const stats = allUsers.map((u) => {
      // Para los gerentes sin cartera propia su tarjeta refleja el total de
      // toda la sucursal (todos los wSchedules / wLoans de la vista del
      // gerente, que ya está acotada al alcance del logueado).
      const aggregator = GERENTES_AGREGADOS_POR_SUCURSAL.has(u.id)
      const uSched  = aggregator ? wSchedules : wSchedules.filter((s) => s.loan.cobradorId === u.id)
      const uLoans  = aggregator ? wLoans     : wLoans.filter((l) => l.cobradorId === u.id)

      // Partición: cliente heredado (heredadoDeId != null) vs propio.
      // Los gerentes-agregadores no distinguen — su vista sigue mostrando
      // el total de la sucursal en una sola sección.
      const isHeredado = (x: { loan?: { client: { heredadoDeId: string | null } }; client?: { heredadoDeId: string | null } }) =>
        Boolean((x.loan?.client ?? x.client!)?.heredadoDeId)

      const propiaSched = aggregator ? uSched : uSched.filter((s) => !isHeredado(s))
      const propiaLoans = aggregator ? uLoans : uLoans.filter((l) => !isHeredado(l))
      const heredSched  = aggregator ? [] : uSched.filter((s) => isHeredado(s))
      const heredLoans  = aggregator ? [] : uLoans.filter((l) => isHeredado(l))

      const propia = buildPairStats(propiaSched, propiaLoans)
      const hered  = buildPairStats(heredSched,  heredLoans)
      const hayHered = !aggregator && (heredSched.length > 0 || heredLoans.length > 0)

      return {
        id: u.id,
        nombre: u.nombre,
        rolLabel: ROL_LABEL_MAP[u.rol] ?? u.rol,
        // Totales combinados para encabezado + agregado de sucursal.
        totalAPagar: propia.totalAPagar + hered.totalAPagar,
        totalCobrado: propia.totalCobrado + hered.totalCobrado,
        cobradosCount: propia.cobradosCount + hered.cobradosCount,
        colocacion: propia.colocacion + hered.colocacion,
        metaTarget: propia.metaTarget + hered.metaTarget,
        cobranzaPct: calcPct(propia.totalCobrado + hered.totalCobrado, propia.totalAPagar + hered.totalAPagar),
        metaPct:     calcPct(propia.colocacion + hered.colocacion,       propia.metaTarget + hered.metaTarget),
        scheduleCount: propia.scheduleCount + hered.scheduleCount,
        propia,
        heredada: hayHered ? hered : null,
      }
    })

    // Total de la sucursal — calculado directamente sobre wSchedules/wLoans
    // (no sumando las tarjetas) porque la tarjeta del gerente sin cartera
    // propia ya contiene el total y duplicaría si se sumara.
    const {
      totalAPagar: aggAPagar,
      totalCobrado: aggCobrado,
      cobradosCount: aggCobradosCount,
    } = calcCobranza(wSchedules)
    const aggColocacion = wLoans.reduce((s, l) => s + Number(l.capital), 0)
    const aggMeta      = metaColocacion(aggAPagar)
    const aggCobranzaPct = calcPct(aggCobrado, aggAPagar)
    const aggMetaPct     = calcPct(aggColocacion, aggMeta)
    const aggSchedCount = wSchedules.length

    return (
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/rutas"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">Ruta semanal — Mi sucursal</h1>
              {isCurrentWeek && (
                <span className="text-[10px] font-bold uppercase tracking-wide bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">
                  En curso
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{weekLabel}</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <KpiCard
            label="Cobranza Efectiva"
            sublabel={`${aggCobradosCount} cobrados de ${aggSchedCount} pactados`}
            pctValue={aggCobranzaPct}
            actual={aggCobrado}
            target={aggAPagar}
            type="cobranza"
          />
          <KpiCard
            label="Meta de Colocación"
            sublabel="70% del total pactado"
            pctValue={aggMetaPct}
            actual={aggColocacion}
            target={aggMeta}
            type="meta"
          />
        </div>

        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Coordinadores ({stats.length})</h2>
          {/* Cards clickables — navegan al detalle del coordinador con
              ?u=<userId>. Desde ahí el Gerente puede imprimir la lista
              detallada por cliente (la misma que ve el coordinador). */}
          <div className="space-y-3">
            {stats.map((s) => (
              <Link
                key={s.id}
                href={`/rutas/${params.semana}?u=${s.id}`}
                className="block rounded-xl hover:shadow-md hover:border-primary-300 transition-all"
              >
                <CobradorCard {...s} />
              </Link>
            ))}
          </div>
        </div>

        {/* El imprimir agregado se removió a propósito: no servía de nada
            (era solo el resumen de coordinadores). El print útil vive
            dentro del detalle de cada coordinador (click en una card → ?u=). */}
      </div>
    )
  }

  // ── DIRECTOR GENERAL / DIRECTOR_COMERCIAL / SUPER_ADMIN view ──────────
  if (isDG) {
    const [allUsuarios, branches] = await Promise.all([
      prisma.user.findMany({
        where: {
          companyId: companyId!,
          rol: { in: ['COORDINADOR', 'COBRADOR', 'GERENTE', 'GERENTE_ZONAL'] },
          activo: true,
        },
        // zonaBranchIds nos sirve para gerentes que cubren varias sucursales
        // (ej. Héctor: Toluca + San Mateo Atenco) — su tarjeta debe agregar
        // TODAS sus sucursales, no sólo la "principal" de `branchId`.
        select: { id: true, nombre: true, rol: true, branchId: true, zonaBranchIds: true },
        orderBy: { nombre: 'asc' },
      }),
      prisma.branch.findMany({
        where: { companyId: companyId! },
        select: { id: true, nombre: true },
        orderBy: { nombre: 'asc' },
      }),
    ])

    const allIds = allUsuarios.map((u) => u.id)

    const [wSchedules, wLoans] = await Promise.all([
      prisma.paymentSchedule.findMany({
        where: {
          fechaVencimiento: { gte: saturday, lte: friday },
          estado: { not: 'FINANCIADO' },
          loan: {
            cobradorId: { in: allIds },
            companyId: companyId!,
            estado: { in: ['ACTIVE', 'LIQUIDATED', 'DEFAULTED'] },
          },
        },
        select: {
          montoEsperado: true,
          montoPagado: true,
          estado: true,
          payments: {
            where: { fechaHora: { gte: saturday, lte: friday } },
            select: { monto: true },
          },
          // branchId hace falta para que las tarjetas de gerentes sin
          // cartera propia agreguen únicamente su sucursal.
          // heredadoDeId permite partir la card en "Su cartera" vs
          // "Cartera heredada" cuando aplica.
          loan: {
            select: {
              cobradorId: true,
              branchId: true,
              client: { select: { heredadoDeId: true } },
            },
          },
        },
      }),
      prisma.loan.findMany({
        where: {
          cobradorId: { in: allIds },
          companyId: companyId!,
          estado: { in: ['ACTIVE', 'LIQUIDATED'] },
          fechaDesembolso: { gte: saturday, lte: friday },
          AND: [loanNotDeletedWhere],
        },
        select: {
          capital: true,
          cobradorId: true,
          branchId: true,
          client: { select: { heredadoDeId: true } },
        },
      }),
    ])

    const ROL_LABEL_MAP: Record<string, string> = {
      COORDINADOR: 'Coordinador', COBRADOR: 'Cobrador',
      GERENTE: 'Gerente', GERENTE_ZONAL: 'Gerente Zonal',
    }

    // Per-user stats
    const userStats = allUsuarios.map((u) => {
      // Para los gerentes sin cartera propia la tarjeta refleja TODA(S)
      // su(s) sucursal(es). Si tiene zonaBranchIds (varias sucursales),
      // agregamos todas (caso Héctor: Toluca + San Mateo Atenco). Si sólo
      // tiene branchId, agregamos esa única.
      const aggregatorBranchIds = (() => {
        if (!GERENTES_AGREGADOS_POR_SUCURSAL.has(u.id)) return null
        const zona = Array.isArray(u.zonaBranchIds) ? (u.zonaBranchIds as string[]) : []
        if (zona.length > 0) return zona
        return u.branchId ? [u.branchId] : null
      })()
      const aggregator = !!aggregatorBranchIds
      const uSched = aggregator
        ? wSchedules.filter((s) => aggregatorBranchIds!.includes(s.loan.branchId))
        : wSchedules.filter((s) => s.loan.cobradorId === u.id)
      const uLoans = aggregator
        ? wLoans.filter((l) => aggregatorBranchIds!.includes(l.branchId))
        : wLoans.filter((l) => l.cobradorId === u.id)

      const isHeredado = (x: { loan?: { client: { heredadoDeId: string | null } }; client?: { heredadoDeId: string | null } }) =>
        Boolean((x.loan?.client ?? x.client!)?.heredadoDeId)
      const propiaSched = aggregator ? uSched : uSched.filter((s) => !isHeredado(s))
      const propiaLoans = aggregator ? uLoans : uLoans.filter((l) => !isHeredado(l))
      const heredSched  = aggregator ? [] : uSched.filter((s) => isHeredado(s))
      const heredLoans  = aggregator ? [] : uLoans.filter((l) => isHeredado(l))
      const propia = buildPairStats(propiaSched, propiaLoans)
      const hered  = buildPairStats(heredSched,  heredLoans)
      const hayHered = !aggregator && (heredSched.length > 0 || heredLoans.length > 0)

      return {
        id: u.id,
        nombre: u.nombre,
        rolLabel: ROL_LABEL_MAP[u.rol] ?? u.rol,
        branchId: u.branchId ?? '',
        aggregator,
        totalAPagar: propia.totalAPagar + hered.totalAPagar,
        totalCobrado: propia.totalCobrado + hered.totalCobrado,
        cobradosCount: propia.cobradosCount + hered.cobradosCount,
        colocacion: propia.colocacion + hered.colocacion,
        metaTarget: propia.metaTarget + hered.metaTarget,
        cobranzaPct: calcPct(propia.totalCobrado + hered.totalCobrado, propia.totalAPagar + hered.totalAPagar),
        metaPct:     calcPct(propia.colocacion + hered.colocacion,       propia.metaTarget + hered.metaTarget),
        scheduleCount: propia.scheduleCount + hered.scheduleCount,
        propia,
        heredada: hayHered ? hered : null,
      }
    })

    // Total empresa — derivado directo del set completo, no de sumar
    // tarjetas (las tarjetas-agregadoras duplicarían si se sumaran).
    const {
      totalAPagar: aggAPagar,
      totalCobrado: aggCobrado,
      cobradosCount: aggCobradosCount,
    } = calcCobranza(wSchedules)
    const aggColocacion = wLoans.reduce((s, l) => s + Number(l.capital), 0)
    const aggMeta       = metaColocacion(aggAPagar)
    const aggCobranzaPct = calcPct(aggCobrado, aggAPagar)
    const aggMetaPct     = calcPct(aggColocacion, aggMeta)
    const aggSchedCount = wSchedules.length

    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/rutas"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">Ruta semanal — Todas las sucursales</h1>
              {isCurrentWeek && (
                <span className="text-[10px] font-bold uppercase tracking-wide bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">
                  En curso
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{weekLabel}</p>
          </div>
        </div>

        {/* Global KPIs */}
        <div className="flex flex-col sm:flex-row gap-4">
          <KpiCard
            label="Cobranza Efectiva"
            sublabel={`${aggCobradosCount} cobrados de ${aggSchedCount} pactados`}
            pctValue={aggCobranzaPct}
            actual={aggCobrado}
            target={aggAPagar}
            type="cobranza"
          />
          <KpiCard
            label="Meta de Colocación"
            sublabel="70% del total pactado"
            pctValue={aggMetaPct}
            actual={aggColocacion}
            target={aggMeta}
            type="meta"
          />
        </div>

        {/* Per-branch sections */}
        {branches.map((branch) => {
          const branchUsers = userStats.filter((u) => u.branchId === branch.id)
          if (branchUsers.length === 0) return null

          // Las tarjetas-agregadoras (gerentes sin cartera propia) ya
          // contienen el total de la sucursal — excluirlas del reduce
          // evita el doble conteo en el encabezado.
          const branchUsersForSum = branchUsers.filter((u) => !u.aggregator)
          const bAPagar     = branchUsersForSum.reduce((s, x) => s + x.totalAPagar, 0)
          const bCobrado    = branchUsersForSum.reduce((s, x) => s + x.totalCobrado, 0)
          const bColocacion = branchUsersForSum.reduce((s, x) => s + x.colocacion, 0)
          const bMeta       = bAPagar * 0.7
          const bCobranzaPct = calcPct(bCobrado, bAPagar)
          const bMetaPct     = calcPct(bColocacion, bMeta)

          return (
            <div key={branch.id} className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-base font-semibold text-gray-900">{branch.nombre}</h2>
                {bAPagar > 0 ? (
                  <span className="text-xs text-muted-foreground ml-auto">
                    Cobranza {bCobranzaPct}% · Colocación {bMetaPct}%
                  </span>
                ) : bColocacion > 0 && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    <span className="font-semibold text-emerald-600">{formatMoney(bColocacion)}</span> colocados · sin meta esta semana
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {branchUsers.map((u) => (
                  <Link
                    key={u.id}
                    href={`/rutas/${params.semana}?u=${u.id}`}
                    className="block rounded-xl hover:shadow-md hover:border-primary-300 transition-all"
                  >
                    <CobradorCard {...u} />
                  </Link>
                ))}
              </div>
            </div>
          )
        })}

        {/* Users with no branch assigned */}
        {(() => {
          const noBranch = userStats.filter((u) => !u.branchId || !branches.find((b) => b.id === u.branchId))
          if (noBranch.length === 0) return null
          return (
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-base font-semibold text-gray-900">Sin sucursal asignada</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {noBranch.map((u) => (
                  <Link
                    key={u.id}
                    href={`/rutas/${params.semana}?u=${u.id}`}
                    className="block rounded-xl hover:shadow-md hover:border-primary-300 transition-all"
                  >
                    <CobradorCard {...u} />
                  </Link>
                ))}
              </div>
            </div>
          )
        })()}

        {/* El imprimir agregado de "todas las sucursales" se removió a
            propósito: era solo un resumen sin detalle por cliente. El
            print útil vive dentro del detalle de cada coordinador
            (click en una card → ?u=<userId>). */}
      </div>
    )
  }

  return null
}
