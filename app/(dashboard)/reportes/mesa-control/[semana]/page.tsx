export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  ArrowLeft, ClipboardCheck, CheckCircle2, RotateCcw, Percent,
} from 'lucide-react'
import { formatMoney } from '@/lib/utils'
import { idToSaturday, getFriday, formatWeekLabelSatFri } from '@/lib/week-utils'
import { ImprimirReporteMCButton } from '@/components/reportes/ImprimirReporteMCButton'

const TIPO_LABEL: Record<string, string> = {
  SOLIDARIO: 'Solidario',
  INDIVIDUAL: 'Individual',
  AGIL: 'Ágil',
  FIDUCIARIO: 'Fiduciario',
}

export default async function ReporteMesaControlSemanaPage({
  params,
}: {
  params: { semana: string }
}) {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  const { rol, companyId, id: userId } = session.user
  const permiteVerTodos = rol === 'DIRECTOR_GENERAL' || rol === 'DIRECTOR_COMERCIAL' || rol === 'SUPER_ADMIN'
  if (rol !== 'MESA_CONTROL' && !permiteVerTodos) redirect('/dashboard')

  const saturday = idToSaturday(params.semana)
  if (isNaN(saturday.getTime())) notFound()
  const friday = getFriday(saturday)
  const weekLabel = formatWeekLabelSatFri(saturday)

  const userFilter = permiteVerTodos
    ? {
        user: {
          companyId: companyId!,
          rol: 'MESA_CONTROL' as const,
        },
      }
    : { userId }

  // 1. Traer las acciones de la semana
  const audit = await prisma.auditLog.findMany({
    where: {
      accion: { in: ['MESA_CONTROL_FORWARD', 'MESA_CONTROL_RETURN'] },
      createdAt: { gte: saturday, lte: friday },
      ...userFilter,
    },
    select: {
      id: true,
      accion: true,
      registroId: true,
      createdAt: true,
      userId: true,
      user: { select: { nombre: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  // 2. Hidratar Loan info por lote
  const loanIds = Array.from(new Set(audit.map((a) => a.registroId).filter((x): x is string => !!x)))
  const loans = loanIds.length
    ? await prisma.loan.findMany({
        where: { id: { in: loanIds }, companyId: companyId! },
        select: {
          id: true,
          tipo: true,
          capital: true,
          revisionNotasGenerales: true,
          client:   { select: { nombreCompleto: true } },
          cobrador: { select: { nombre: true } },
          branch:   { select: { nombre: true } },
        },
      })
    : []
  const loanMap = new Map(loans.map((l) => [l.id, l]))

  // 3. Armar filas por evento (una fila por acción; una solicitud puede
  //    aparecer varias veces si fue regresada y luego forwardeada)
  const filas = audit.map((a) => {
    const loan = a.registroId ? loanMap.get(a.registroId) ?? null : null
    return {
      auditId: a.id,
      accion: a.accion as 'MESA_CONTROL_FORWARD' | 'MESA_CONTROL_RETURN',
      fecha: a.createdAt,
      mcNombre: a.user?.nombre ?? '—',
      loanId: a.registroId,
      cliente: loan?.client?.nombreCompleto ?? '(borrado)',
      cobrador: loan?.cobrador?.nombre ?? '—',
      sucursal: loan?.branch?.nombre ?? '—',
      tipo: loan ? TIPO_LABEL[loan.tipo] ?? loan.tipo : '—',
      capital: loan ? Number(loan.capital) : 0,
      observaciones: loan?.revisionNotasGenerales ?? '',
    }
  })

  const aprobadas = filas.filter((f) => f.accion === 'MESA_CONTROL_FORWARD').length
  const regresadas = filas.filter((f) => f.accion === 'MESA_CONTROL_RETURN').length
  const total = aprobadas + regresadas
  const pct = total > 0 ? Math.round((aprobadas / total) * 100) : 0
  const capitalAprobado = filas
    .filter((f) => f.accion === 'MESA_CONTROL_FORWARD')
    .reduce((s, f) => s + f.capital, 0)

  const scopeLabel = permiteVerTodos
    ? 'Todos los usuarios de Mesa de Control'
    : 'Mi actividad de revisión'

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 print:p-0 print:max-w-none">
      {/* Header + botón imprimir (oculto en print) */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/reportes/mesa-control"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ClipboardCheck className="h-6 w-6 text-primary-500" />
              Reporte Mesa de Control
            </h1>
            <p className="text-sm text-muted-foreground">{weekLabel} · {scopeLabel}</p>
          </div>
        </div>
        <ImprimirReporteMCButton />
      </div>

      {/* Header versión print — colorless, tipografía compacta */}
      <div className="hidden print:block mb-4">
        <h1 className="text-lg font-bold">Reporte Mesa de Control</h1>
        <p className="text-xs text-gray-600">{weekLabel} · {scopeLabel}</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:grid-cols-4">
        <Card className="print:border print:shadow-none">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total revisadas</p>
            <p className="text-2xl font-bold text-foreground">{total}</p>
          </CardContent>
        </Card>
        <Card className="print:border print:shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              <p className="text-xs text-muted-foreground">Aprobadas</p>
            </div>
            <p className="text-2xl font-bold text-emerald-400">{aprobadas}</p>
            <p className="text-[11px] text-muted-foreground mt-1 money">{formatMoney(capitalAprobado)}</p>
          </CardContent>
        </Card>
        <Card className="print:border print:shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <RotateCcw className="h-3.5 w-3.5 text-amber-400" />
              <p className="text-xs text-muted-foreground">Regresadas</p>
            </div>
            <p className="text-2xl font-bold text-amber-400">{regresadas}</p>
          </CardContent>
        </Card>
        <Card className="print:border print:shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Percent className="h-3.5 w-3.5 text-primary-400" />
              <p className="text-xs text-muted-foreground">% Aprobación</p>
            </div>
            <p className="text-2xl font-bold text-primary-400">{pct}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabla detallada */}
      <Card className="print:border print:shadow-none">
        <CardContent className="p-0">
          {filas.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Sin actividad de revisión en esta semana.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Fecha</th>
                    <th className="px-3 py-2 text-left">Cliente</th>
                    <th className="px-3 py-2 text-left">Sucursal</th>
                    <th className="px-3 py-2 text-left">Coordinador</th>
                    <th className="px-3 py-2 text-left">Tipo</th>
                    <th className="px-3 py-2 text-right">Capital</th>
                    <th className="px-3 py-2 text-left">Decisión MC</th>
                    <th className="px-3 py-2 text-left">Observaciones</th>
                    {permiteVerTodos && <th className="px-3 py-2 text-left">Revisó</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filas.map((f) => (
                    <tr key={f.auditId} className="hover:bg-secondary/20 print:hover:bg-transparent">
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                        {f.fecha.toLocaleString('es-MX', {
                          day: '2-digit', month: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td className="px-3 py-2 font-medium">{f.cliente}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{f.sucursal}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{f.cobrador}</td>
                      <td className="px-3 py-2 text-xs">{f.tipo}</td>
                      <td className="px-3 py-2 text-right money">{formatMoney(f.capital)}</td>
                      <td className="px-3 py-2">
                        {f.accion === 'MESA_CONTROL_FORWARD' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" /> Aprobada
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400">
                            <RotateCcw className="h-3 w-3" /> Regresada
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-xs">
                        {f.observaciones ? (
                          <span className="italic">{f.observaciones}</span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                      {permiteVerTodos && (
                        <td className="px-3 py-2 text-xs text-muted-foreground">{f.mcNombre}</td>
                      )}
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
