export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatMoney } from '@/lib/utils'
import { Undo2, ExternalLink } from 'lucide-react'

/**
 * Histórico de pagos revertidos — todos los eventos de "Deshacer" que
 * ejecutaron DG / DC / SUPER_ADMIN o quien tenga permisoAplicarPagos
 * (Cristina, p.ej.). Fuente única: AuditLog con accion en
 *   - SUPER_ADMIN_UNDO_PAYMENT        (individual, registroId = scheduleId)
 *   - SUPER_ADMIN_UNDO_PAYMENT_GRUPO  (grupal, registroId = loanGroupId)
 *
 * El UI de /deshacer ahora exige justificación mínima de 5 chars; los
 * eventos viejos sin justificación muestran "— sin justificación —".
 *
 * Acceso: mismo set que puede ejecutar un undo (DG / DC / SA / permiso).
 */
export default async function PagosRevertidosPage({
  searchParams,
}: {
  searchParams: { page?: string }
}) {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  const { rol, companyId, id: userId } = session.user
  if (!companyId) redirect('/dashboard')

  const esOpAdmin =
    rol === 'DIRECTOR_GENERAL' ||
    rol === 'DIRECTOR_COMERCIAL' ||
    rol === 'SUPER_ADMIN'

  const permisos = await prisma.user.findUnique({
    where: { id: userId },
    select: { permisoAplicarPagos: true },
  })
  const puedeVer = esOpAdmin || permisos?.permisoAplicarPagos === true
  if (!puedeVer) redirect('/dashboard')

  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1)
  const PAGE_SIZE = 50
  const skip = (page - 1) * PAGE_SIZE

  // Traer SOLO los audits que nos interesan. companyId se filtra por el
  // user autor (los directores solo revierten en su propia empresa).
  const where = {
    accion: { in: ['SUPER_ADMIN_UNDO_PAYMENT', 'SUPER_ADMIN_UNDO_PAYMENT_GRUPO'] },
    user: { companyId },
  }

  const [audits, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      select: {
        id: true,
        accion: true,
        registroId: true,
        createdAt: true,
        valoresNuevos: true,
        user: { select: { id: true, nombre: true, rol: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
  ])

  // Resolver nombre de cliente / préstamo. Para individuales el
  // registroId es un scheduleId; para grupales es un loanGroupId.
  const scheduleIds = audits
    .filter((a) => a.accion === 'SUPER_ADMIN_UNDO_PAYMENT' && a.registroId)
    .map((a) => a.registroId as string)
  const groupIds = audits
    .filter((a) => a.accion === 'SUPER_ADMIN_UNDO_PAYMENT_GRUPO' && a.registroId)
    .map((a) => a.registroId as string)

  const [scheduleMap, groupMap] = await Promise.all([
    scheduleIds.length > 0
      ? prisma.paymentSchedule.findMany({
          where: { id: { in: scheduleIds } },
          select: {
            id: true,
            numeroPago: true,
            montoEsperado: true,
            loan: {
              select: {
                id: true,
                client: { select: { nombreCompleto: true } },
                branch: { select: { nombre: true } },
              },
            },
          },
        }).then((rows) => new Map(rows.map((r) => [r.id, r])))
      : new Map(),
    groupIds.length > 0
      ? prisma.loanGroup.findMany({
          where: { id: { in: groupIds } },
          select: {
            id: true,
            nombre: true,
            branch: { select: { nombre: true } },
          },
        }).then((rows) => new Map(rows.map((r) => [r.id, r])))
      : new Map(),
  ])

  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const ROL_LABEL: Record<string, string> = {
    DIRECTOR_GENERAL:   'Director General',
    DIRECTOR_COMERCIAL: 'Director Comercial',
    SUPER_ADMIN:        'Administrador del Sistema',
    MESA_CONTROL:       'Mesa de Control',
    GERENTE_ZONAL:      'Gerente Zonal',
    GERENTE:            'Gerente',
    COORDINADOR:        'Coordinador',
    COBRADOR:           'Cobrador',
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Undo2 className="h-6 w-6 text-amber-500" />
            Pagos revertidos
          </h1>
          <p className="text-sm text-muted-foreground">
            Histórico de todos los pagos que Dirección deshizo (individuales y grupales).
            Cada reversión queda con fecha, hora, autor y justificación.
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {total} evento{total === 1 ? '' : 's'} · página {page}/{totalPaginas}
        </Badge>
      </div>

      <Card className="glass-hover-card">
        <CardHeader>
          <CardTitle className="text-base">Reversiones recientes primero</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {audits.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-muted-foreground">
              No hay pagos revertidos aún.
            </p>
          ) : (
            <div className="divide-y divide-border/40">
              {audits.map((a) => {
                const v = (a.valoresNuevos as {
                  justificacion?: string
                  numeroPago?: number
                  schedulesRevertidos?: number
                  loanId?: string
                } | null) ?? {}
                const esGrupo = a.accion === 'SUPER_ADMIN_UNDO_PAYMENT_GRUPO'
                const justificacion = v.justificacion?.trim() ?? ''

                let titulo: React.ReactNode
                let detalle: React.ReactNode
                let href: string | null = null

                if (esGrupo && a.registroId) {
                  const g = groupMap.get(a.registroId) as {
                    nombre: string | null
                    branch: { nombre: string } | null
                  } | undefined
                  const nombreGrupo = g?.nombre ?? 'Grupo (sin nombre)'
                  const sucursal = g?.branch?.nombre ?? '—'
                  titulo = (
                    <>
                      Grupo <strong>{nombreGrupo}</strong>
                      {typeof v.numeroPago === 'number' && (
                        <> · cuota <strong>#{v.numeroPago}</strong></>
                      )}
                    </>
                  )
                  detalle = (
                    <>
                      Sucursal {sucursal}
                      {typeof v.schedulesRevertidos === 'number' && (
                        <> · {v.schedulesRevertidos} integrante{v.schedulesRevertidos === 1 ? '' : 's'} afectado{v.schedulesRevertidos === 1 ? '' : 's'}</>
                      )}
                    </>
                  )
                  href = `/grupos/${a.registroId}`
                } else if (a.registroId) {
                  const s = scheduleMap.get(a.registroId) as {
                    numeroPago: number
                    montoEsperado: unknown
                    loan: {
                      id: string
                      client: { nombreCompleto: string }
                      branch: { nombre: string } | null
                    }
                  } | undefined
                  const cliente = s?.loan.client.nombreCompleto ?? '(cliente no disponible)'
                  const sucursal = s?.loan.branch?.nombre ?? '—'
                  const monto = s ? Number(s.montoEsperado) : 0
                  titulo = (
                    <>
                      Cliente <strong>{cliente}</strong>
                      {s && (
                        <> · cuota <strong>#{s.numeroPago}</strong> ({formatMoney(monto)})</>
                      )}
                    </>
                  )
                  detalle = <>Sucursal {sucursal}</>
                  href = s ? `/prestamos/${s.loan.id}` : (v.loanId ? `/prestamos/${v.loanId}` : null)
                } else {
                  titulo = <>Reversión sin referencia</>
                  detalle = null
                }

                return (
                  <div key={a.id} className="px-6 py-4 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground">{titulo}</p>
                        {detalle && (
                          <p className="text-xs text-muted-foreground mt-0.5">{detalle}</p>
                        )}
                      </div>
                      {href && (
                        <Link
                          href={href}
                          className="shrink-0 text-xs text-sky-400 hover:text-sky-300 inline-flex items-center gap-1"
                        >
                          Ver <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        <span className="font-semibold text-foreground">Revertido por:</span>{' '}
                        {a.user?.nombre ?? '—'}{' '}
                        <span className="text-sky-400/80">
                          ({a.user?.rol ? (ROL_LABEL[a.user.rol] ?? a.user.rol) : '—'})
                        </span>
                      </span>
                      <span>
                        <span className="font-semibold text-foreground">Fecha:</span>{' '}
                        {a.createdAt.toLocaleString('es-MX', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                      <Badge variant={esGrupo ? 'warning' : 'outline'} className="text-[10px]">
                        {esGrupo ? 'Grupal' : 'Individual'}
                      </Badge>
                    </div>

                    <div className="rounded-md border border-amber-300/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                      <span className="font-semibold text-amber-200">Justificación: </span>
                      {justificacion.length > 0 ? justificacion : (
                        <span className="italic text-amber-300/70">— sin justificación (reversión anterior al cambio) —</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {totalPaginas > 1 && (
        <div className="flex items-center justify-center gap-2">
          {page > 1 && (
            <Link
              href={`/pagos-revertidos?page=${page - 1}`}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-secondary"
            >
              ← Anterior
            </Link>
          )}
          <span className="text-xs text-muted-foreground">
            Página {page} de {totalPaginas}
          </span>
          {page < totalPaginas && (
            <Link
              href={`/pagos-revertidos?page=${page + 1}`}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-secondary"
            >
              Siguiente →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
