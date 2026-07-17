import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatMoney, formatDate } from '@/lib/utils'
import {
  ClipboardList, AlertTriangle, CheckCircle, RotateCcw, Percent,
  BarChart3, ArrowRight, Clock,
} from 'lucide-react'
import { loanNotDeletedWhere } from '@/lib/access'
import { getSaturday, getFriday } from '@/lib/week-utils'
import { todayMx } from '@/lib/timezone'

const TIPO_LABEL: Record<string, string> = {
  SOLIDARIO: 'Solidario',
  INDIVIDUAL: 'Individual',
  AGIL: 'Ágil',
  FIDUCIARIO: 'Fiduciario',
}

/**
 * Dashboard específico para MESA_CONTROL. Muestra:
 *   - 4 KPI cards: por revisar / aprobadas semana / regresadas semana / % aprobación
 *   - Accesos rápidos: bandeja, reporte semanal
 *   - Últimas 5 revisiones (aprobadas + regresadas)
 *
 * MC solo ve SU actividad. DG/DC entran al dashboard operativo normal,
 * no a este.
 */
export async function MesaControlDashboard({
  companyId, userId,
}: {
  companyId: string
  userId: string
}) {
  const now = new Date()
  const satActual = getSaturday(now)
  const friActual = getFriday(satActual)
  const hoy = todayMx()

  const [pendientesCount, semanaAudit, hoyAudit, ultimasAudit] = await Promise.all([
    prisma.loan.count({
      where: {
        companyId,
        estado: 'PENDING_REVIEW',
        ...loanNotDeletedWhere,
      },
    }),
    prisma.auditLog.findMany({
      where: {
        userId,
        accion: { in: ['MESA_CONTROL_FORWARD', 'MESA_CONTROL_RETURN'] },
        createdAt: { gte: satActual, lte: friActual },
      },
      select: { accion: true },
    }),
    prisma.auditLog.findMany({
      where: {
        userId,
        accion: { in: ['MESA_CONTROL_FORWARD', 'MESA_CONTROL_RETURN'] },
        createdAt: { gte: hoy },
      },
      select: { accion: true },
    }),
    prisma.auditLog.findMany({
      where: {
        userId,
        accion: { in: ['MESA_CONTROL_FORWARD', 'MESA_CONTROL_RETURN'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true, accion: true, registroId: true, createdAt: true,
      },
    }),
  ])

  const semAprobadas  = semanaAudit.filter((a) => a.accion === 'MESA_CONTROL_FORWARD').length
  const semRegresadas = semanaAudit.filter((a) => a.accion === 'MESA_CONTROL_RETURN').length
  const semTotal      = semAprobadas + semRegresadas
  const semPct        = semTotal > 0 ? Math.round((semAprobadas / semTotal) * 100) : 0
  const hoyTotal      = hoyAudit.length

  // Hidratar Loan info de las últimas 5
  const loanIds = Array.from(new Set(ultimasAudit.map((a) => a.registroId).filter((x): x is string => !!x)))
  const loans = loanIds.length
    ? await prisma.loan.findMany({
        where: { id: { in: loanIds }, companyId },
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

  const ultimas = ultimasAudit.map((a) => ({
    id: a.id,
    accion: a.accion as 'MESA_CONTROL_FORWARD' | 'MESA_CONTROL_RETURN',
    fecha: a.createdAt,
    loan: a.registroId ? loanMap.get(a.registroId) ?? null : null,
  }))

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-primary-500" />
          Dashboard — Mesa de Control
        </h1>
        <p className="text-sm text-muted-foreground">Resumen de tu actividad de revisión.</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-xl p-2.5 bg-yellow-500/15">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Por revisar (empresa)</p>
              <p className="text-2xl font-bold text-yellow-500">{pendientesCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-xl p-2.5 bg-emerald-500/15">
              <CheckCircle className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Aprobadas (semana)</p>
              <p className="text-2xl font-bold text-emerald-400">{semAprobadas}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-xl p-2.5 bg-amber-500/15">
              <RotateCcw className="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Regresadas (semana)</p>
              <p className="text-2xl font-bold text-amber-400">{semRegresadas}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-xl p-2.5 bg-primary-500/15">
              <Percent className="h-4 w-4 text-primary-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">% Aprobación</p>
              <p className="text-2xl font-bold text-primary-400">{semPct}%</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Hoy: {hoyTotal}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Accesos rápidos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Button asChild variant="outline" className="justify-between h-auto py-3">
          <Link href="/mesa-control">
            <span className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Bandeja de solicitudes
            </span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        <Button asChild variant="outline" className="justify-between h-auto py-3">
          <Link href="/reportes/mesa-control">
            <span className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Reporte semanal
            </span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      {/* Últimas revisiones */}
      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b border-border/60 flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold">Últimas 5 revisiones</h2>
          </div>
          {ultimas.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Aún no has revisado solicitudes.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {ultimas.map((u) => (
                <li key={u.id} className="p-4 flex items-start gap-3">
                  {u.accion === 'MESA_CONTROL_FORWARD' ? (
                    <div className="rounded-lg p-1.5 bg-emerald-500/15 shrink-0 mt-0.5">
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                    </div>
                  ) : (
                    <div className="rounded-lg p-1.5 bg-amber-500/15 shrink-0 mt-0.5">
                      <RotateCcw className="h-3.5 w-3.5 text-amber-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {u.loan ? (
                        <Link
                          href={`/prestamos/${u.loan.id}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {u.loan.client.nombreCompleto}
                        </Link>
                      ) : (
                        <span className="font-medium text-muted-foreground">(borrado)</span>
                      )}
                      {u.loan && (
                        <Badge variant="outline" className="text-[10px]">
                          {TIPO_LABEL[u.loan.tipo] ?? u.loan.tipo}
                        </Badge>
                      )}
                      {u.loan && (
                        <span className="text-xs text-muted-foreground money">
                          {formatMoney(Number(u.loan.capital))}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {u.loan?.cobrador?.nombre ?? '—'}
                      {u.loan?.branch?.nombre ? ` · ${u.loan.branch.nombre}` : ''}
                      {' · '}
                      {formatDate(u.fecha)} {u.fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {u.loan?.revisionNotasGenerales && (
                      <p className="text-xs italic text-muted-foreground mt-1 border-l-2 border-border pl-2">
                        {u.loan.revisionNotasGenerales}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
