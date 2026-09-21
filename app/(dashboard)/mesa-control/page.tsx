export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { AlertTriangle, ClipboardList, CheckCircle, RotateCcw, BarChart3 } from 'lucide-react'
import { loanNotDeletedWhere } from '@/lib/access'
import { getSaturday, getFriday } from '@/lib/week-utils'
import { MesaControlListas, type MesaControlLoan } from './MesaControlListas'
import type { DesembolsoVideoRow } from './DesembolsosVideoList'

const ROLES_PERMITIDOS = ['MESA_CONTROL', 'DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'SUPER_ADMIN']

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

  const [pendientes, regresadas, semanaAudit, desembolsosVideo] = await Promise.all([
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
    // Loans con actividad de video de desembolso: ya subieron y
    // aprobaron, o ya intentaron y siguen sin aprobar. Se ordena por
    // fecha del video (los mas recientes arriba) y como fallback por
    // updatedAt (para los que solo tienen intentos rechazados sin
    // subida final).
    //
    // Nota: loanNotDeletedWhere tiene su propio OR interno; combinarlo
    // con nuestro OR via spread hace que uno pise al otro. Usamos AND
    // anidado para que ambos filtros convivan sin colisionar.
    prisma.loan.findMany({
      where: {
        companyId: companyId!,
        AND: [
          {
            OR: [
              { desembolsoVideoUrl: { not: null } },
              { desembolsoIntentos: { gt: 0 } },
            ],
          },
          loanNotDeletedWhere,
        ],
      },
      orderBy: [
        { desembolsoVideoSubidoAt: 'desc' },
        { updatedAt: 'desc' },
      ],
      take: 200,
      include: {
        client:   { select: { id: true, nombreCompleto: true } },
        cobrador: { select: { id: true, nombre: true } },
        branch:   { select: { nombre: true } },
      },
    }),
  ])

  // Serializar para el client component — Decimal → string, Date → ISO.
  const toClient = (loan: (typeof pendientes)[number]): MesaControlLoan => ({
    id:                     loan.id,
    tipo:                   loan.tipo,
    capital:                loan.capital.toString(),
    createdAt:              loan.createdAt.toISOString(),
    notas:                  loan.notas,
    revisadoAt:             loan.revisadoAt ? loan.revisadoAt.toISOString() : null,
    revisionNotasGenerales: loan.revisionNotasGenerales,
    client:                 loan.client,
    cobrador:               loan.cobrador,
    branchNombre:           loan.branch?.nombre ?? null,
  })
  const pendientesSer = pendientes.map(toClient)
  const regresadasSer = regresadas.map(toClient)

  // Serializar desembolsos-video para el client.
  // desembolsoValidacion viene como JSON — extraemos solo los checks
  // que la UI necesita, con tipo tolerante.
  interface CheckJson { ok?: unknown; detalle?: unknown }
  const desembolsosVideoSer: DesembolsoVideoRow[] = desembolsosVideo.map((l) => {
    const v = (l.desembolsoValidacion ?? null) as { checks?: Record<string, CheckJson> } | null
    const readCheck = (k: string): { ok: boolean; detalle: string } | null => {
      const c = v?.checks?.[k]
      if (!c) return null
      return {
        ok: Boolean(c.ok),
        detalle: typeof c.detalle === 'string' ? c.detalle : '',
      }
    }
    return {
      loanId:         l.id,
      clienteNombre:  l.client.nombreCompleto,
      clienteId:      l.client.id,
      tipo:           l.tipo,
      capital:        l.capital.toString(),
      branchNombre:   l.branch?.nombre ?? 'Sin sucursal',
      cobradorNombre: l.cobrador?.nombre ?? 'Sin coordinador',
      cobradorId:     l.cobrador?.id ?? '',
      estadoLoan:     l.estado,
      aprobado:       l.desembolsoAprobado,
      intentos:       l.desembolsoIntentos ?? 0,
      videoUrl:       l.desembolsoVideoUrl,
      videoAt:        l.desembolsoVideoSubidoAt ? l.desembolsoVideoSubidoAt.toISOString() : null,
      lat:            l.desembolsoLat,
      lng:            l.desembolsoLng,
      transcripcion:  l.desembolsoTranscripcion,
      checks: v?.checks
        ? {
            nombre:        readCheck('nombre'),
            fecha:         readCheck('fecha'),
            monto:         readCheck('monto'),
            palabraDelDia: readCheck('palabraDelDia'),
            dineroVisible: readCheck('dineroVisible'),
          }
        : null,
    }
  })

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

      {/* Listas Por revisar / Regresadas / Desembolsos-video — tabs client-side */}
      <MesaControlListas
        pendientes={pendientesSer}
        regresadas={regresadasSer}
        desembolsosVideo={desembolsosVideoSer}
      />
    </div>
  )
}
