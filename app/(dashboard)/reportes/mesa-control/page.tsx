export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { ClipboardCheck, ChevronRight, CheckCircle2, RotateCcw } from 'lucide-react'
import {
  semanasRecientesSatFri, getFriday, formatWeekLabelSatFri, saturdayToId, getSaturday,
} from '@/lib/week-utils'

/**
 * Índice de reportes semanales de Mesa de Control.
 *
 * MC ve solo su propia actividad; DG/DC ven la actividad de TODOS los
 * usuarios con rol MESA_CONTROL de la empresa (para evaluar). Cada card
 * lleva a /reportes/mesa-control/[semana] con el desglose.
 */
export default async function ReportesMesaControlIndex() {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  const { rol, companyId, id: userId } = session.user
  const permiteVerTodos = rol === 'DIRECTOR_GENERAL' || rol === 'DIRECTOR_COMERCIAL' || rol === 'SUPER_ADMIN'
  if (rol !== 'MESA_CONTROL' && !permiteVerTodos) redirect('/dashboard')

  const semanas = semanasRecientesSatFri(10)
  const periodoStart = semanas[semanas.length - 1]
  const periodoEnd   = getFriday(semanas[0])

  // Quienes cuentan: si es MC, solo él mismo. Si es DG/DC, todos los MC de la empresa.
  const userFilter = permiteVerTodos
    ? {
        user: {
          companyId: companyId!,
          rol: 'MESA_CONTROL' as const,
        },
      }
    : { userId }

  const audit = await prisma.auditLog.findMany({
    where: {
      accion: { in: ['MESA_CONTROL_FORWARD', 'MESA_CONTROL_RETURN'] },
      createdAt: { gte: periodoStart, lte: periodoEnd },
      ...userFilter,
    },
    select: { accion: true, createdAt: true },
  })

  const thisSat = getSaturday(new Date())

  const weekData = semanas.map((saturday) => {
    const friday = getFriday(saturday)
    const isCurrent = saturday.getTime() === thisSat.getTime()
    const eventos = audit.filter((a) => a.createdAt >= saturday && a.createdAt <= friday)
    const aprobadas = eventos.filter((a) => a.accion === 'MESA_CONTROL_FORWARD').length
    const regresadas = eventos.filter((a) => a.accion === 'MESA_CONTROL_RETURN').length
    const total = aprobadas + regresadas
    const pct = total > 0 ? Math.round((aprobadas / total) * 100) : 0
    return {
      saturday,
      weekId: saturdayToId(saturday),
      label: formatWeekLabelSatFri(saturday),
      isCurrent,
      aprobadas,
      regresadas,
      total,
      pct,
    }
  })

  const scopeLabel = permiteVerTodos
    ? 'Todos los usuarios de Mesa de Control'
    : 'Mi actividad de revisión'

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <ClipboardCheck className="h-6 w-6 text-primary-600" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reporte de Mesa de Control</h1>
          <p className="text-sm text-muted-foreground">{scopeLabel}</p>
        </div>
      </div>

      <div className="space-y-3">
        {weekData.map((w) => (
          <Link
            key={w.weekId}
            href={`/reportes/mesa-control/${w.weekId}`}
            className="block"
          >
            <Card className="hover:shadow-md hover:border-primary-500/40 transition-all">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground">{w.label}</p>
                      {w.isCurrent && (
                        <span className="text-[10px] font-bold uppercase tracking-wide bg-primary-500/15 text-primary-300 px-2 py-0.5 rounded-full">
                          En curso
                        </span>
                      )}
                    </div>
                    {w.total === 0 ? (
                      <p className="text-xs text-muted-foreground mt-0.5">Sin actividad</p>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {w.total} solicitud{w.total === 1 ? '' : 'es'} revisada{w.total === 1 ? '' : 's'} · {w.pct}% aprobadas
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                </div>

                {w.total > 0 && (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="rounded-md p-1.5 bg-emerald-500/15">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Aprobadas</p>
                        <p className="font-semibold text-emerald-400">{w.aprobadas}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="rounded-md p-1.5 bg-amber-500/15">
                        <RotateCcw className="h-3.5 w-3.5 text-amber-400" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Regresadas</p>
                        <p className="font-semibold text-amber-400">{w.regresadas}</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
