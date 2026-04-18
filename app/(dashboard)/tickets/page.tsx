import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { formatMoney, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { Building2, UserCheck, Ticket as TicketIcon, RotateCcw, Ban, Eye } from 'lucide-react'
import { TicketsClientView } from './TicketsClientView'

export const dynamic = 'force-dynamic'

export default async function TicketsPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  const { rol, companyId } = session.user

  const isDirector = rol === 'DIRECTOR_GENERAL' || rol === 'DIRECTOR_COMERCIAL' || rol === 'SUPER_ADMIN'

  // Para coordinadores/cobradores/gerentes — vista cliente con acciones
  if (!isDirector) {
    return <TicketsClientView />
  }

  // Para directores — vista agrupada por sucursal → empleado (solo lectura)
  const tickets = await prisma.ticket.findMany({
    where: { companyId: companyId! },
    orderBy: { impresoAt: 'desc' },
    take: 500,
    include: {
      branch: { select: { id: true, nombre: true } },
      impresoPor: { select: { id: true, nombre: true, rol: true } },
      payment: {
        select: {
          monto: true,
          metodoPago: true,
          client: { select: { nombreCompleto: true } },
        },
      },
    },
  })

  // Agrupar: sucursal → empleado → tickets
  type TicketRow = typeof tickets[number]
  const branchMap: Record<string, {
    branchNombre: string
    empleados: Record<string, {
      empleadoNombre: string
      empleadoRol: string
      tickets: TicketRow[]
    }>
  }> = {}

  for (const t of tickets) {
    const bId = t.branchId
    const eId = t.impresoPorId
    if (!branchMap[bId]) branchMap[bId] = { branchNombre: t.branch.nombre, empleados: {} }
    if (!branchMap[bId].empleados[eId]) {
      branchMap[bId].empleados[eId] = {
        empleadoNombre: t.impresoPor.nombre,
        empleadoRol: t.impresoPor.rol,
        tickets: [],
      }
    }
    branchMap[bId].empleados[eId].tickets.push(t)
  }

  // Métricas globales
  const totalTickets = tickets.length
  const totalReimpresiones = tickets.filter((t) => t.esReimpresion).length
  const totalAnulados = tickets.filter((t) => t.anulado).length
  const totalOriginales = totalTickets - totalReimpresiones

  const ROL_LABEL: Record<string, string> = {
    DIRECTOR_GENERAL: 'Director General',
    DIRECTOR_COMERCIAL: 'Director Comercial',
    GERENTE_ZONAL: 'Gerente Zonal',
    GERENTE: 'Gerente',
    COORDINADOR: 'Coordinador',
    COBRADOR: 'Cobrador',
    SUPER_ADMIN: 'Super Administrador',
  }

  const METODO_LABEL: Record<string, string> = {
    CASH: 'Efectivo',
    CARD: 'Tarjeta',
    TRANSFER: 'Transferencia',
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Historial de tickets</h1>
        <p className="text-muted-foreground text-sm">
          Registro global de impresiones y reimpresiones — últimos 500
        </p>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total tickets</p>
            <p className="text-2xl font-bold">{totalTickets}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <TicketIcon className="h-3 w-3" /> Originales
            </p>
            <p className="text-2xl font-bold text-emerald-400">{totalOriginales}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <RotateCcw className="h-3 w-3" /> Reimpresiones
            </p>
            <p className="text-2xl font-bold text-amber-400">{totalReimpresiones}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Ban className="h-3 w-3" /> Anulados
            </p>
            <p className="text-2xl font-bold text-red-400">{totalAnulados}</p>
          </CardContent>
        </Card>
      </div>

      {Object.keys(branchMap).length === 0 && (
        <div className="text-center py-12">
          <TicketIcon className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No hay tickets registrados aún</p>
        </div>
      )}

      {/* Agrupación por sucursal */}
      {Object.entries(branchMap).map(([bId, branch]) => {
        const branchTotal = Object.values(branch.empleados).reduce((s, e) => s + e.tickets.length, 0)

        return (
          <div key={bId} className="space-y-3">
            <div className="flex items-center gap-2 pt-2">
              <Building2 className="h-4 w-4 text-primary-400" />
              <h2 className="font-semibold text-lg">{branch.branchNombre}</h2>
              <span className="text-xs text-muted-foreground">· {branchTotal} tickets</span>
            </div>

            {Object.entries(branch.empleados).map(([eId, emp]) => {
              const empReimpresiones = emp.tickets.filter((t) => t.esReimpresion).length
              const empAnulados = emp.tickets.filter((t) => t.anulado).length

              return (
                <Card key={eId}>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <UserCheck className="h-4 w-4 text-primary-400" />
                        <span>{emp.empleadoNombre}</span>
                        <span className="text-xs text-muted-foreground font-normal">
                          ({ROL_LABEL[emp.empleadoRol] ?? emp.empleadoRol})
                        </span>
                      </div>
                      <div className="text-xs font-normal flex items-center gap-3">
                        <span>{emp.tickets.length} tickets</span>
                        {empReimpresiones > 0 && (
                          <span className="text-amber-400">{empReimpresiones} reimpr.</span>
                        )}
                        {empAnulados > 0 && (
                          <span className="text-red-400">{empAnulados} anulados</span>
                        )}
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="space-y-1.5">
                      {emp.tickets.map((t) => (
                        <Link
                          key={t.id}
                          href={`/verificar/${encodeURIComponent(t.numeroTicket)}`}
                          target="_blank"
                          className={`flex items-center gap-3 py-2 px-3 rounded-lg text-sm border transition-colors ${
                            t.anulado
                              ? 'bg-red-500/5 border-red-500/20 opacity-60'
                              : t.esReimpresion
                              ? 'bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40'
                              : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs font-semibold">{t.numeroTicket}</span>
                              {t.esReimpresion && <Badge variant="warning" className="text-[10px] px-1.5 py-0">Reimpr.</Badge>}
                              {t.anulado && <Badge variant="error" className="text-[10px] px-1.5 py-0">Anulado</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {t.payment.client.nombreCompleto} · {METODO_LABEL[t.payment.metodoPago] ?? t.payment.metodoPago} · {formatDate(t.impresoAt, "dd/MM/yyyy HH:mm")}
                            </p>
                          </div>
                          <div className="text-right shrink-0 flex items-center gap-2">
                            <span className="font-semibold text-sm">{formatMoney(Number(t.payment.monto))}</span>
                            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
