export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatMoney, formatDate } from '@/lib/utils'
import { AlertTriangle, ClipboardList, CheckCircle, Building2, User, RotateCcw, BarChart3 } from 'lucide-react'
import { loanNotDeletedWhere } from '@/lib/access'
import { getSaturday, getFriday } from '@/lib/week-utils'

const ROLES_PERMITIDOS = ['MESA_CONTROL', 'DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'SUPER_ADMIN']

type LoanRow = {
  id: string
  tipo: string
  capital: unknown
  createdAt: Date
  notas: string | null
  revisadoAt: Date | null
  revisionNotasGenerales: string | null
  client: { id: string; nombreCompleto: string }
  cobrador: { nombre: string }
  branch: { nombre: string } | null
}

/**
 * Agrupa una lista de préstamos por sucursal → coordinador. Preserva el
 * orden que ya trajo el query (por sucursal asc, coordinador asc, fecha).
 * "Sin sucursal" cae en una llave especial al final para no perder registros.
 */
function agrupar(loans: LoanRow[]) {
  const porSucursal = new Map<string, Map<string, LoanRow[]>>()
  for (const loan of loans) {
    const sucursal = loan.branch?.nombre ?? 'Sin sucursal'
    const coordinador = loan.cobrador.nombre
    if (!porSucursal.has(sucursal)) porSucursal.set(sucursal, new Map())
    const porCoordinador = porSucursal.get(sucursal)!
    if (!porCoordinador.has(coordinador)) porCoordinador.set(coordinador, [])
    porCoordinador.get(coordinador)!.push(loan)
  }
  return Array.from(porSucursal.entries()).map(([sucursal, coordinadores]) => ({
    sucursal,
    coordinadores: Array.from(coordinadores.entries()).map(([coordinador, loans]) => ({
      coordinador,
      loans,
    })),
    total: Array.from(coordinadores.values()).reduce((s, ls) => s + ls.length, 0),
  }))
}

export default async function MesaControlPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  if (!ROLES_PERMITIDOS.includes(session.user.rol)) redirect('/prestamos')

  const { companyId, rol, id: userId } = session.user

  // Scope de métricas semanales:
  //   - MC → solo su propia actividad
  //   - DG / DC / SA → toda la mesa (todos los usuarios con rol MC)
  const permiteVerTodos = rol === 'DIRECTOR_GENERAL' || rol === 'DIRECTOR_COMERCIAL' || rol === 'SUPER_ADMIN'
  const userFilterMetric = permiteVerTodos
    ? { user: { companyId: companyId!, rol: 'MESA_CONTROL' as const } }
    : { userId }

  // Semana en curso (Sáb-Vie CDMX)
  const satActual = getSaturday(new Date())
  const friActual = getFriday(satActual)

  const [pendientes, regresadas, semanaAudit] = await Promise.all([
    prisma.loan.findMany({
      where: {
        companyId: companyId!,
        estado: 'PENDING_REVIEW',
        ...loanNotDeletedWhere,
      },
      orderBy: [
        { branch: { nombre: 'asc' } },
        { cobrador: { nombre: 'asc' } },
        { createdAt: 'asc' },
      ],
      include: {
        client: { select: { id: true, nombreCompleto: true } },
        cobrador: { select: { nombre: true } },
        branch: { select: { nombre: true } },
      },
    }),
    prisma.loan.findMany({
      where: {
        companyId: companyId!,
        estado: 'RETURNED_TO_COORDINATOR',
        ...loanNotDeletedWhere,
      },
      orderBy: [
        { branch: { nombre: 'asc' } },
        { cobrador: { nombre: 'asc' } },
        { revisadoAt: 'desc' },
      ],
      include: {
        client: { select: { id: true, nombreCompleto: true } },
        cobrador: { select: { nombre: true } },
        branch: { select: { nombre: true } },
      },
    }),
    prisma.auditLog.findMany({
      where: {
        accion: { in: ['MESA_CONTROL_FORWARD', 'MESA_CONTROL_RETURN'] },
        createdAt: { gte: satActual, lte: friActual },
        ...userFilterMetric,
      },
      select: { accion: true },
    }),
  ])

  const pendientesAgrupadas = agrupar(pendientes)
  const regresadasAgrupadas = agrupar(regresadas)

  const semAprobadas  = semanaAudit.filter((a) => a.accion === 'MESA_CONTROL_FORWARD').length
  const semRegresadas = semanaAudit.filter((a) => a.accion === 'MESA_CONTROL_RETURN').length
  const semTotal      = semAprobadas + semRegresadas
  const semPct        = semTotal > 0 ? Math.round((semAprobadas / semTotal) * 100) : 0

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-primary-700" />
          Mesa de Control
        </h1>
        <p className="text-muted-foreground">
          Revisa expedientes de solicitudes antes de enviarlas a aprobación de Dirección General.
        </p>
      </div>

      {/* KPIs de la semana (Sáb-Vie CDMX). Para MC: su propia actividad.
          Para DG/DC: agregado de toda la mesa de control. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-xl p-2.5 bg-yellow-500/15">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Por revisar</p>
              <p className="text-2xl font-bold text-yellow-500">{pendientes.length}</p>
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
        <Link href="/reportes/mesa-control" className="block">
          <Card className="hover:shadow-md hover:border-primary-500/40 transition-all">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="rounded-xl p-2.5 bg-primary-500/15">
                <BarChart3 className="h-4 w-4 text-primary-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">% Aprobación</p>
                <p className="text-2xl font-bold text-primary-400">{semPct}%</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Ver reporte →</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
          Por revisar ({pendientes.length})
        </h2>
        {pendientes.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
              No hay solicitudes pendientes de revisión.
            </CardContent>
          </Card>
        ) : (
          <ListaAgrupada grupos={pendientesAgrupadas} variante="pendiente" />
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-blue-500" />
          Regresadas al coordinador ({regresadas.length})
        </h2>
        {regresadas.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8 text-muted-foreground">
              Ninguna solicitud regresada por el momento.
            </CardContent>
          </Card>
        ) : (
          <ListaAgrupada grupos={regresadasAgrupadas} variante="regresada" />
        )}
      </section>
    </div>
  )
}

function ListaAgrupada({
  grupos,
  variante,
}: {
  grupos: ReturnType<typeof agrupar>
  variante: 'pendiente' | 'regresada'
}) {
  return (
    <div className="space-y-6">
      {grupos.map((grupo) => (
        <div key={grupo.sucursal} className="space-y-3">
          <div className="flex items-center gap-2 border-b border-gray-200 pb-1.5">
            <Building2 className="h-4 w-4 text-primary-700" />
            <h3 className="font-semibold text-gray-900">{grupo.sucursal}</h3>
            <span className="text-xs text-muted-foreground">({grupo.total})</span>
          </div>
          {grupo.coordinadores.map(({ coordinador, loans }) => (
            <div key={coordinador} className="space-y-2 ml-2">
              <div className="flex items-center gap-1.5 text-sm">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium text-gray-700">{coordinador}</span>
                <span className="text-xs text-muted-foreground">({loans.length})</span>
              </div>
              <div className="space-y-2 ml-1">
                {loans.map((loan) => (
                  <Link key={loan.id} href={`/prestamos/${loan.id}`}>
                    <Card className="hover:bg-gray-50 transition-colors cursor-pointer">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold">{loan.client.nombreCompleto}</span>
                          <Badge variant={variante === 'regresada' ? 'default' : 'warning'}>
                            {variante === 'regresada' ? 'Regresada' : loan.tipo}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm mt-1">
                          <div>
                            <span className="text-muted-foreground">Capital:</span>{' '}
                            <span className="font-medium money">{formatMoney(Number(loan.capital))}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              {variante === 'regresada' ? 'Regresada:' : 'Solicitado:'}
                            </span>{' '}
                            {variante === 'regresada'
                              ? loan.revisadoAt
                                ? formatDate(loan.revisadoAt)
                                : '—'
                              : formatDate(loan.createdAt)}
                          </div>
                        </div>
                        {variante === 'regresada' && loan.revisionNotasGenerales && (
                          <p className="text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded p-2 mt-2 whitespace-pre-wrap">
                            {loan.revisionNotasGenerales}
                          </p>
                        )}
                        {variante === 'pendiente' && loan.notas && (
                          <p className="text-sm text-muted-foreground italic mt-2">{loan.notas}</p>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
