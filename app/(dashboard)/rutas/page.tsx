export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { loanNotDeletedWhere } from '@/lib/access'
import Link from 'next/link'
import { formatMoney } from '@/lib/utils'
import { Navigation, ChevronRight, TrendingUp, Target } from 'lucide-react'
import {
  semanasRecientesSatFri, getFriday, formatWeekLabelSatFri, saturdayToId, getSaturday,
} from '@/lib/week-utils'

function pct(cobrado: number, total: number) {
  return total > 0 ? Math.round((cobrado / total) * 100) : 0
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

export default async function RutasPage() {
  const session = await getSession()
  if (!session?.user) return null

  const { id: userId, rol, companyId, branchId } = session.user

  // ── Determine which cobradores this user can see ──────────────────────
  let cobradorIds: string[] = [userId]

  if (rol === 'GERENTE' || rol === 'GERENTE_ZONAL') {
    const branchIds = (session.user.zonaBranchIds as string[] | null)?.length
      ? (session.user.zonaBranchIds as string[])
      : branchId ? [branchId] : []
    const users = await prisma.user.findMany({
      where: {
        companyId: companyId!,
        branchId: { in: branchIds },
        rol: { in: ['COORDINADOR', 'COBRADOR', 'GERENTE', 'GERENTE_ZONAL'] },
        activo: true,
      },
      select: { id: true },
    })
    cobradorIds = Array.from(new Set([userId, ...users.map((u) => u.id)]))
  } else if (rol === 'DIRECTOR_GENERAL' || rol === 'DIRECTOR_COMERCIAL' || rol === 'SUPER_ADMIN') {
    const users = await prisma.user.findMany({
      where: {
        companyId: companyId!,
        rol: { in: ['COORDINADOR', 'COBRADOR', 'GERENTE', 'GERENTE_ZONAL'] },
        activo: true,
      },
      select: { id: true },
    })
    cobradorIds = users.map((u) => u.id)
  }

  // ── Fetch last 10 weeks in one batch (Sábado–Viernes) ────────────────
  const semanas = semanasRecientesSatFri(10)
  const periodoStart = semanas[semanas.length - 1]
  const periodoEnd   = getFriday(semanas[0])

  const [allSchedules, allLoans] = await Promise.all([
    prisma.paymentSchedule.findMany({
      where: {
        fechaVencimiento: { gte: periodoStart, lte: periodoEnd },
        estado: { not: 'FINANCIADO' },
        loan: {
          cobradorId: { in: cobradorIds },
          companyId: companyId!,
          estado: { in: ['ACTIVE', 'LIQUIDATED', 'DEFAULTED'] },
          AND: [loanNotDeletedWhere],
        },
      },
      select: {
        montoEsperado: true,
        montoPagado: true,
        estado: true,
        fechaVencimiento: true,
        // Cobranza efectiva (estricta) = sum(Payment.monto) capeado, ATADA
        // a la semana en que se hizo el Payment (fechaHora), no a la semana
        // del schedule. Antes los cobros anticipados (típico de renovación
        // que absorbe pagos del crédito viejo) se contaban como cobranza
        // de la semana del fechaVencimiento, inflando reportes de semanas
        // futuras. Para semanas viejas (sin captura formal) caemos a una
        // cobranza "preliminar" basada en estado del schedule.
        payments: {
          where: { fechaHora: { gte: periodoStart, lte: periodoEnd } },
          select: { monto: true, fechaHora: true },
        },
      },
    }),
    prisma.loan.findMany({
      where: {
        cobradorId: { in: cobradorIds },
        companyId: companyId!,
        estado: { in: ['ACTIVE', 'LIQUIDATED'] },
        fechaDesembolso: { gte: periodoStart, lte: periodoEnd },
        AND: [loanNotDeletedWhere],
      },
      select: { capital: true, fechaDesembolso: true },
    }),
  ])

  // ── Calculate per-week stats (Sábado–Viernes) ────────────────────────
  // La cobranza efectiva ESTRICTA (sum Payment.monto) solo aplica para la
  // semana en curso y la inmediatamente anterior — son las dos donde
  // sabemos que el equipo está capturando con el flujo nuevo. Para las
  // semanas más viejas caemos al cálculo viejo (basado en
  // PaymentSchedule.estado / montoPagado) y mostramos un badge
  // "Preliminar" para que quede claro que NO es cobranza respaldada por
  // Payment, solo el marcado de schedules. Sin esto las semanas viejas
  // salían en 0%/1% porque casi nada quedó en Payment.
  const thisSat = getSaturday(new Date())

  const weekData = semanas.map((saturday, idx) => {
    const friday     = getFriday(saturday)
    const isCurrent  = saturday.getTime() === thisSat.getTime()
    // semanas[0] es la más reciente. Las dos primeras (en curso + previa)
    // usan el cálculo estricto; el resto usa el preliminar.
    const usaCalculoEstricto = idx <= 1

    const wSchedules = allSchedules.filter((s) => {
      const d = new Date(s.fechaVencimiento)
      return d >= saturday && d <= friday
    })

    // Filtrar payments DEL schedule a los que se hicieron DENTRO de esta
    // semana — un Payment hecho en semana previa (cobro anticipado o
    // renovación absorbida) NO debe contar como cobranza de esta semana.
    // Anotamos cada schedule con sus paymentsEnSemana para los cálculos.
    const wSchedulesConPaymentsSemana = wSchedules.map((s) => {
      const paymentsEnSemana = s.payments.filter((p) => {
        const d = new Date(p.fechaHora)
        return d >= saturday && d <= friday
      })
      return { ...s, paymentsEnSemana }
    })

    // Pre-pagados (PAID/ADVANCE sin Payment esta semana) salen del cálculo
    // — el dinero ya entró en una semana anterior, esta semana no se
    // cobra ni se debe.
    const wSchedulesActivos = wSchedulesConPaymentsSemana.filter((s) => {
      const sinPaymentEstaSemana = s.paymentsEnSemana.length === 0
      const yaCobradoAntes = s.estado === 'PAID' || s.estado === 'ADVANCE'
      return !(sinPaymentEstaSemana && yaCobradoAntes)
    })

    const totalAPagar  = wSchedulesActivos.reduce((sum, s) => sum + Number(s.montoEsperado), 0)

    const totalCobradoEstricto = wSchedulesActivos.reduce((sum, s) => {
      const paid = s.paymentsEnSemana.reduce((acc, p) => acc + Number(p.monto), 0)
      return sum + Math.min(paid, Number(s.montoEsperado))
    }, 0)

    const totalCobradoPreliminar = wSchedules.reduce((sum, s) => {
      if (s.estado === 'PAID' || s.estado === 'ADVANCE') return sum + Number(s.montoEsperado)
      if (s.estado === 'PARTIAL')                        return sum + Number(s.montoPagado)
      return sum
    }, 0)

    const totalCobrado = usaCalculoEstricto ? totalCobradoEstricto : totalCobradoPreliminar

    const colocacion = allLoans
      .filter((l) => l.fechaDesembolso && l.fechaDesembolso >= saturday && l.fechaDesembolso <= friday)
      .reduce((sum, l) => sum + Number(l.capital), 0)

    const metaTarget    = totalAPagar * 0.7
    const cobranzaPct   = pct(totalCobrado, totalAPagar)
    const metaPct       = pct(colocacion, metaTarget)

    return {
      saturday,
      weekId: saturdayToId(saturday),
      label: formatWeekLabelSatFri(saturday),
      isCurrent,
      esPreliminar: !usaCalculoEstricto,
      totalAPagar,
      totalCobrado,
      cobranzaPct,
      colocacion,
      metaTarget,
      metaPct,
      count: wSchedules.length,
    }
  })

  const scopeLabel =
    rol === 'COORDINADOR' || rol === 'COBRADOR' ? 'Mi ruta personal' :
    rol === 'GERENTE'      || rol === 'GERENTE_ZONAL' ? 'Mi sucursal' :
    'Todas las sucursales'

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Navigation className="h-6 w-6 text-primary-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rutas Semanales</h1>
          <p className="text-sm text-muted-foreground">{scopeLabel}</p>
        </div>
      </div>

      {/* Week cards */}
      <div className="space-y-3">
        {weekData.map((w) => {
          const cb = barColor(w.cobranzaPct, 'cobranza')
          const mb = barColor(w.metaPct, 'meta')
          return (
            <Link
              key={w.weekId}
              href={`/rutas/${w.weekId}`}
              className="block bg-white border rounded-xl p-4 hover:shadow-md hover:border-primary-300 transition-all group"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900">{w.label}</p>
                    {w.isCurrent && (
                      <span className="text-[10px] font-bold uppercase tracking-wide bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">
                        En curso
                      </span>
                    )}
                    {w.esPreliminar && (
                      <span
                        className="text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full"
                        title="Cifra basada en el estado del schedule, no en Payments respaldados. Es una aproximación de cobranza histórica."
                      >
                        Preliminar
                      </span>
                    )}
                  </div>
                  {w.count === 0 ? (
                    <p className="text-xs text-muted-foreground mt-0.5">Sin cobros pactados</p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-0.5">{w.count} cobros pactados</p>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary-600 shrink-0 mt-1 transition-colors" />
              </div>

              {w.count > 0 && (
                <div className="grid grid-cols-2 gap-4">
                  {/* Cobranza */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" /> Cobranza efectiva
                      </span>
                      <span className="text-sm font-bold text-gray-800">{w.cobranzaPct}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${cb} rounded-full`} style={{ width: `${Math.min(100, w.cobranzaPct)}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatMoney(w.totalCobrado)} / {formatMoney(w.totalAPagar)}
                    </p>
                  </div>
                  {/* Meta */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Target className="h-3 w-3" /> Meta colocación
                      </span>
                      <span className="text-sm font-bold text-gray-800">{w.metaPct}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${mb} rounded-full`} style={{ width: `${Math.min(100, w.metaPct)}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatMoney(w.colocacion)} / {formatMoney(w.metaTarget)} meta
                    </p>
                  </div>
                </div>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
