export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { Video } from 'lucide-react'
import { loanNotDeletedWhere } from '@/lib/access'
import { DesembolsosVideoList, type DesembolsoVideoRow } from '@/components/desembolsos/DesembolsosVideoList'

/**
 * /desembolsos-video — pagina de auditoria dedicada al flujo de
 * activacion por video anti-fraude. Antes vivia como tab dentro de
 * /mesa-control, pero Mesa de Control es papeleo (revision de
 * solicitudes) y el video de desembolso es activacion en campo — son
 * flujos distintos y merece su propia entrada de menu.
 *
 * Roles con acceso: MESA_CONTROL (dia a dia), DIRECTOR_GENERAL,
 * DIRECTOR_COMERCIAL, SUPER_ADMIN (supervision).
 */
const ROLES_PERMITIDOS = ['MESA_CONTROL', 'DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'SUPER_ADMIN']

export default async function DesembolsosVideoPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  if (!ROLES_PERMITIDOS.includes(session.user.rol)) redirect('/dashboard')

  const { companyId, rol } = session.user

  const loans = await prisma.loan.findMany({
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
      { desembolsoEscaladoAt: 'desc' },  // los escalados van arriba
      { desembolsoVideoSubidoAt: 'desc' },
      { updatedAt: 'desc' },
    ],
    take: 200,
    include: {
      client:   { select: { id: true, nombreCompleto: true } },
      cobrador: { select: { id: true, nombre: true } },
      branch:   { select: { nombre: true } },
    },
  })

  // Resolver el nombre del usuario que escalo — como no hay relation
  // formal (solo desembolsoEscaladoPorId : String?), hacemos un lookup
  // separado con los IDs distintos. Volumen bajo.
  const escaladosPorIds = Array.from(
    new Set(loans.map((l) => l.desembolsoEscaladoPorId).filter((x): x is string => !!x)),
  )
  const escaladores = escaladosPorIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: escaladosPorIds } },
        select: { id: true, nombre: true },
      })
    : []
  const escaladorPorId = new Map(escaladores.map((u) => [u.id, u.nombre]))

  interface CheckJson { ok?: unknown; detalle?: unknown }
  const rows: DesembolsoVideoRow[] = loans.map((l) => {
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
      loanId:            l.id,
      clienteNombre:     l.client.nombreCompleto,
      clienteId:         l.client.id,
      tipo:              l.tipo,
      capital:           l.capital.toString(),
      branchNombre:      l.branch?.nombre ?? 'Sin sucursal',
      cobradorNombre:    l.cobrador?.nombre ?? 'Sin coordinador',
      cobradorId:        l.cobrador?.id ?? '',
      estadoLoan:        l.estado,
      aprobado:          l.desembolsoAprobado,
      intentos:          l.desembolsoIntentos ?? 0,
      videoUrl:          l.desembolsoVideoUrl,
      videoAt:           l.desembolsoVideoSubidoAt ? l.desembolsoVideoSubidoAt.toISOString() : null,
      lat:               l.desembolsoLat,
      lng:               l.desembolsoLng,
      transcripcion:     l.desembolsoTranscripcion,
      escaladoAt:        l.desembolsoEscaladoAt ? l.desembolsoEscaladoAt.toISOString() : null,
      escaladoPorNombre: l.desembolsoEscaladoPorId ? (escaladorPorId.get(l.desembolsoEscaladoPorId) ?? null) : null,
      escaladoNota:      l.desembolsoEscaladoNota,
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

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Video className="h-6 w-6 text-primary-700" />
          Desembolsos con video
        </h1>
        <p className="text-muted-foreground">
          Auditoría del flujo anti-fraude de activación por video. Cada tarjeta muestra el video, los 5 checks
          automáticos (Whisper + Claude Vision), y permite escalar a Dirección cuando algo se ve raro.
        </p>
      </div>

      <DesembolsosVideoList rows={rows} rol={rol} />
    </div>
  )
}
