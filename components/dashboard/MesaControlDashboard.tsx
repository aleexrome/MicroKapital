import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatMoney, formatDate } from '@/lib/utils'
import {
  ClipboardList, AlertTriangle, CheckCircle, RotateCcw, Percent,
  BarChart3, ArrowRight, Clock, TrendingUp, Sparkles,
} from 'lucide-react'
import { loanNotDeletedWhere } from '@/lib/access'
import { getSaturday, getFriday } from '@/lib/week-utils'
import { todayMx } from '@/lib/timezone'
import { MesaControlBarChart, MesaControlDonut } from './MesaControlCharts'

const TIPO_LABEL: Record<string, string> = {
  SOLIDARIO: 'Solidario',
  INDIVIDUAL: 'Individual',
  AGIL: 'Ágil',
  FIDUCIARIO: 'Fiduciario',
}

const DOC_LABEL: Record<string, string> = {
  INE_FRONT: 'INE (frente)', INE_BACK: 'INE (reverso)', PHOTO: 'Foto',
  CONTRACT: 'Contrato', PROOF_ADDRESS: 'Comprobante domicilio', OTHER: 'Otro',
}

const DIAS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

/**
 * Dashboard específico para MESA_CONTROL. Layout:
 *   - Header con saludo + nombre del usuario
 *   - 4 KPI cards con colores diferenciados
 *   - Fila con gráfica de barras (por día) + donut (aprobadas vs regresadas)
 *   - Accesos rápidos: bandeja, reporte semanal
 *   - Últimas 5 revisiones con TODAS las observaciones (general + por doc)
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

  const [me, pendientesCount, semanaAudit, hoyAudit, ultimasAudit] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { nombre: true },
    }),
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
      select: { accion: true, createdAt: true },
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

  // Partir la semana Sáb → Vie en buckets diarios para la gráfica de barras
  const diaKey = (d: Date) => {
    // slice a día CDMX (sábado, domingo, ..., viernes)
    return d.toISOString().slice(0, 10)
  }
  const buckets = new Map<string, { aprobadas: number; regresadas: number }>()
  for (let i = 0; i < 7; i++) {
    const d = new Date(satActual)
    d.setUTCDate(d.getUTCDate() + i)
    buckets.set(diaKey(d), { aprobadas: 0, regresadas: 0 })
  }
  for (const a of semanaAudit) {
    const key = diaKey(new Date(a.createdAt))
    const bucket = buckets.get(key)
    if (bucket) {
      if (a.accion === 'MESA_CONTROL_FORWARD') bucket.aprobadas++
      else bucket.regresadas++
    }
  }
  const chartData = Array.from(buckets.entries()).map(([key, v]) => {
    const d = new Date(key + 'T00:00:00Z')
    return { dia: DIAS_ES[d.getUTCDay()], aprobadas: v.aprobadas, regresadas: v.regresadas }
  })

  // Hidratar Loan info + observaciones (general + docs) de las últimas 5
  const loanIds = Array.from(new Set(ultimasAudit.map((a) => a.registroId).filter((x): x is string => !!x)))
  const loans = loanIds.length
    ? await prisma.loan.findMany({
        where: { id: { in: loanIds }, companyId },
        select: {
          id: true,
          tipo: true,
          capital: true,
          clientId: true,
          revisionNotasGenerales: true,
          client:   { select: { nombreCompleto: true } },
          cobrador: { select: { nombre: true } },
          branch:   { select: { nombre: true } },
          documents: {
            where: { revisionNota: { not: null } },
            select: { tipo: true, revisionNota: true },
          },
        },
      })
    : []
  const clientIds = Array.from(new Set(loans.map((l) => l.clientId)))
  const clientDocs = clientIds.length
    ? await prisma.clientDocument.findMany({
        where: { clientId: { in: clientIds }, revisionNota: { not: null } },
        select: { clientId: true, tipo: true, revisionNota: true },
      })
    : []
  const clientDocsByClient = new Map<string, typeof clientDocs>()
  for (const d of clientDocs) {
    const arr = clientDocsByClient.get(d.clientId) ?? []
    arr.push(d)
    clientDocsByClient.set(d.clientId, arr)
  }

  const loanMap = new Map(loans.map((l) => [l.id, l]))

  function obsDeLoan(loan: typeof loans[number] | null): Array<{ label: string; texto: string }> {
    if (!loan) return []
    const out: Array<{ label: string; texto: string }> = []
    if (loan.revisionNotasGenerales) out.push({ label: 'General', texto: loan.revisionNotasGenerales })
    for (const d of loan.documents)   out.push({ label: DOC_LABEL[d.tipo] ?? d.tipo, texto: d.revisionNota! })
    for (const d of (clientDocsByClient.get(loan.clientId) ?? []))
      out.push({ label: DOC_LABEL[d.tipo] ?? d.tipo, texto: d.revisionNota! })
    return out
  }

  const ultimas = ultimasAudit.map((a) => ({
    id: a.id,
    accion: a.accion as 'MESA_CONTROL_FORWARD' | 'MESA_CONTROL_RETURN',
    fecha: a.createdAt,
    loan: a.registroId ? loanMap.get(a.registroId) ?? null : null,
    observaciones: obsDeLoan(a.registroId ? loanMap.get(a.registroId) ?? null : null),
  }))

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header con saludo */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary-400" />
            Hola, {me?.nombre?.split(' ')[0] ?? 'Mesa de Control'}
          </h1>
          <p className="text-sm text-muted-foreground">Este es tu tablero de trabajo.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/mesa-control">
              <ClipboardList className="h-4 w-4" />
              Bandeja
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/reportes/mesa-control">
              <BarChart3 className="h-4 w-4" />
              Reporte semanal
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI cards con gradientes/borders de color */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-yellow-500/30 bg-gradient-to-br from-yellow-500/5 to-transparent">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="rounded-xl p-2 bg-yellow-500/15">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
              </div>
              <span className="text-[10px] uppercase tracking-widest text-yellow-500/70">Empresa</span>
            </div>
            <p className="text-3xl font-black text-yellow-500">{pendientesCount}</p>
            <p className="text-xs text-muted-foreground mt-1">Por revisar</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-transparent">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="rounded-xl p-2 bg-emerald-500/15">
                <CheckCircle className="h-4 w-4 text-emerald-400" />
              </div>
              <span className="text-[10px] uppercase tracking-widest text-emerald-400/70">Semana</span>
            </div>
            <p className="text-3xl font-black text-emerald-400">{semAprobadas}</p>
            <p className="text-xs text-muted-foreground mt-1">Aprobadas</p>
          </CardContent>
        </Card>
        <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-transparent">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="rounded-xl p-2 bg-amber-500/15">
                <RotateCcw className="h-4 w-4 text-amber-400" />
              </div>
              <span className="text-[10px] uppercase tracking-widest text-amber-400/70">Semana</span>
            </div>
            <p className="text-3xl font-black text-amber-400">{semRegresadas}</p>
            <p className="text-xs text-muted-foreground mt-1">Regresadas</p>
          </CardContent>
        </Card>
        <Card className="border-primary-500/30 bg-gradient-to-br from-primary-500/5 to-transparent">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="rounded-xl p-2 bg-primary-500/15">
                <TrendingUp className="h-4 w-4 text-primary-400" />
              </div>
              <span className="text-[10px] uppercase tracking-widest text-primary-400/70">Hoy: {hoyTotal}</span>
            </div>
            <p className="text-3xl font-black text-primary-400">{semPct}%</p>
            <p className="text-xs text-muted-foreground mt-1">Aprobación semana</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráficas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary-400" />
                Actividad de la semana
              </h2>
              <span className="text-xs text-muted-foreground">Sáb → Vie</span>
            </div>
            <MesaControlBarChart data={chartData} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Percent className="h-4 w-4 text-primary-400" />
              <h2 className="text-sm font-semibold text-foreground">Split semanal</h2>
            </div>
            <MesaControlDonut aprobadas={semAprobadas} regresadas={semRegresadas} />
          </CardContent>
        </Card>
      </div>

      {/* Últimas revisiones */}
      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b border-border/60 flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Últimas 5 revisiones</h2>
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
                    {u.observaciones.length > 0 && (
                      <ul className="mt-2 space-y-1 border-l-2 border-border pl-2">
                        {u.observaciones.map((o, i) => (
                          <li key={i} className="text-xs text-muted-foreground italic">
                            <span className="not-italic font-semibold text-foreground/80">{o.label}:</span>{' '}{o.texto}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <Link
                    href={`/prestamos/${u.loan?.id ?? ''}`}
                    className="text-muted-foreground hover:text-foreground shrink-0"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
