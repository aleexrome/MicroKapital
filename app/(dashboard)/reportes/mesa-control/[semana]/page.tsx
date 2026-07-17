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
import { EditarNotaMCButton } from '@/components/reportes/EditarNotaMCButton'

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

  // 2. Hidratar Loan info + observaciones a documentos por lote.
  //    Las observaciones de MC pueden vivir en:
  //      - Loan.revisionNotasGenerales (nota libre general)
  //      - LoanDocument.revisionNota    (por documento del préstamo)
  //      - ClientDocument.revisionNota  (por documento del cliente)
  //    Un préstamo aprobado sin nota general puede tener aún observaciones
  //    en documentos específicos — todas cuentan como "observaciones de MC".
  const loanIds = Array.from(new Set(audit.map((a) => a.registroId).filter((x): x is string => !!x)))
  const loans = loanIds.length
    ? await prisma.loan.findMany({
        where: { id: { in: loanIds }, companyId: companyId! },
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
  const loanMap = new Map(loans.map((l) => [l.id, l]))

  // Observaciones a documentos del CLIENTE de cada loan (INE, comprobante,
  // foto, etc.) — se traen por lote agrupadas por clientId.
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

  const DOC_LABEL: Record<string, string> = {
    INE_FRONT: 'INE (frente)', INE_BACK: 'INE (reverso)', PHOTO: 'Foto',
    CONTRACT: 'Contrato', PROOF_ADDRESS: 'Comprobante domicilio', OTHER: 'Otro',
  }

  function juntarObservaciones(loan: typeof loans[number] | null): Array<{ label: string; texto: string }> {
    if (!loan) return []
    const out: Array<{ label: string; texto: string }> = []
    if (loan.revisionNotasGenerales) {
      out.push({ label: 'Observación MC', texto: loan.revisionNotasGenerales })
    }
    for (const d of loan.documents) {
      out.push({ label: DOC_LABEL[d.tipo] ?? d.tipo, texto: d.revisionNota! })
    }
    const clientDocsForLoan = clientDocsByClient.get(loan.clientId) ?? []
    for (const d of clientDocsForLoan) {
      out.push({ label: DOC_LABEL[d.tipo] ?? d.tipo, texto: d.revisionNota! })
    }
    return out
  }

  // 3. Armar filas por evento (una fila por acción; una solicitud puede
  //    aparecer varias veces si fue regresada y luego forwardeada).
  //    Los contadores agregados (aprobadas/regresadas) usan TODO el audit
  //    — MC hizo la revisión aunque el préstamo se borre después. La
  //    tabla en cambio oculta filas de préstamos ya borrados porque no
  //    aportan info útil al DG/MC leyendo el reporte.
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
      observaciones: juntarObservaciones(loan),
      notaMC: loan?.revisionNotasGenerales ?? null,
    }
  })

  const aprobadas = filas.filter((f) => f.accion === 'MESA_CONTROL_FORWARD').length
  const regresadas = filas.filter((f) => f.accion === 'MESA_CONTROL_RETURN').length
  // Filas visibles (tabla + hoja imprimible): oculta préstamos ya
  // eliminados que solo tienen la entry de audit sin datos útiles.
  const filasVisibles = filas.filter((f) => f.loanId && loanMap.has(f.loanId))
  const total = aprobadas + regresadas
  const pct = total > 0 ? Math.round((aprobadas / total) * 100) : 0
  const capitalAprobado = filas
    .filter((f) => f.accion === 'MESA_CONTROL_FORWARD')
    .reduce((s, f) => s + f.capital, 0)

  const scopeLabel = permiteVerTodos
    ? 'Todos los usuarios de Mesa de Control'
    : 'Mi actividad de revisión'

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 print:p-0 print:max-w-none print-mc-report">
      {/* CSS de impresión — fuerza colores y logo en header. Se define
          inline para no ensuciar el global stylesheet. */}
      <style>{`
        @media print {
          .print-mc-report {
            color: #000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-mc-report * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-mc-report .print-badge-aprobada {
            background-color: #d1fae5 !important;
            color: #047857 !important;
            padding: 2px 6px !important;
            border-radius: 4px !important;
          }
          .print-mc-report .print-badge-regresada {
            background-color: #fef3c7 !important;
            color: #b45309 !important;
            padding: 2px 6px !important;
            border-radius: 4px !important;
          }
          .print-mc-report .print-kpi-card {
            border: 1px solid #d1d5db !important;
            border-radius: 8px !important;
            padding: 12px !important;
          }
          .print-mc-report .print-kpi-aprobadas { color: #059669 !important; }
          .print-mc-report .print-kpi-regresadas { color: #d97706 !important; }
          .print-mc-report .print-kpi-pct { color: #4f46e5 !important; }
          .print-mc-report table thead {
            background-color: #f3f4f6 !important;
            color: #374151 !important;
          }
          .print-mc-report table tbody tr {
            border-bottom: 1px solid #e5e7eb !important;
          }
        }
        @page { margin: 12mm; }
      `}</style>

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
        <ImprimirReporteMCButton
          weekLabel={weekLabel}
          scopeLabel={scopeLabel}
          mostrarColumnaRevisor={permiteVerTodos}
          aprobadas={aprobadas}
          regresadas={regresadas}
          total={total}
          pct={pct}
          capitalAprobado={capitalAprobado}
          filas={filasVisibles.map((f) => ({
            fechaISO: f.fecha.toISOString(),
            cliente: f.cliente,
            sucursal: f.sucursal,
            cobrador: f.cobrador,
            tipo: f.tipo,
            capital: f.capital,
            accion: f.accion,
            mcNombre: f.mcNombre,
            observaciones: f.observaciones,
          }))}
        />
      </div>

      {/* Header versión print — con logo MK y branding sobrio */}
      <div className="hidden print:block mb-4">
        <div className="flex items-start justify-between border-b border-gray-300 pb-3 mb-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">MicroKapital Financiera</h1>
            <p className="text-sm font-semibold text-gray-800 mt-1">Reporte Mesa de Control</p>
            <p className="text-xs text-gray-600 mt-0.5">{weekLabel} · {scopeLabel}</p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://res.cloudinary.com/djs8dtzrq/image/upload/v1777329446/PHOTO-2026-04-27-16-21-06-removebg-preview_fczmpb.png"
            alt="MicroKapital"
            style={{ height: '64px', width: 'auto' }}
          />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:grid-cols-4">
        <Card className="print:border print:shadow-none print-kpi-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground print:text-gray-700">Total revisadas</p>
            <p className="text-2xl font-bold text-foreground print:text-black">{total}</p>
          </CardContent>
        </Card>
        <Card className="print:border print:shadow-none print-kpi-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 print-kpi-aprobadas" />
              <p className="text-xs text-muted-foreground print:text-gray-700">Aprobadas</p>
            </div>
            <p className="text-2xl font-bold text-emerald-400 print-kpi-aprobadas">{aprobadas}</p>
            <p className="text-[11px] text-muted-foreground print:text-gray-700 mt-1 money">{formatMoney(capitalAprobado)}</p>
          </CardContent>
        </Card>
        <Card className="print:border print:shadow-none print-kpi-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <RotateCcw className="h-3.5 w-3.5 text-amber-400 print-kpi-regresadas" />
              <p className="text-xs text-muted-foreground print:text-gray-700">Regresadas</p>
            </div>
            <p className="text-2xl font-bold text-amber-400 print-kpi-regresadas">{regresadas}</p>
          </CardContent>
        </Card>
        <Card className="print:border print:shadow-none print-kpi-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Percent className="h-3.5 w-3.5 text-primary-400 print-kpi-pct" />
              <p className="text-xs text-muted-foreground print:text-gray-700">% Aprobación</p>
            </div>
            <p className="text-2xl font-bold text-primary-400 print-kpi-pct">{pct}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabla detallada */}
      <Card className="print:border print:shadow-none">
        <CardContent className="p-0">
          {filasVisibles.length === 0 ? (
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
                  {filasVisibles.map((f) => (
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
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 print-badge-aprobada">
                            <CheckCircle2 className="h-3 w-3" /> Aprobada
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 print-badge-regresada">
                            <RotateCcw className="h-3 w-3" /> Regresada
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-md">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            {f.observaciones.length === 0 ? (
                              <span className="text-muted-foreground/50">—</span>
                            ) : (
                              <ul className="space-y-1">
                                {f.observaciones.map((o, i) => (
                                  <li key={i} className="italic">
                                    <span className="not-italic font-semibold text-foreground/80">{o.label}:</span>{' '}{o.texto}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          {f.loanId && (
                            <EditarNotaMCButton
                              loanId={f.loanId}
                              clienteNombre={f.cliente}
                              initialNota={f.notaMC}
                            />
                          )}
                        </div>
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
