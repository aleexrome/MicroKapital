import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { TicketsClientView } from './TicketsClientView'
import { TicketsAdminView, type AdminTicketRow } from './TicketsAdminView'

export const dynamic = 'force-dynamic'

export default async function TicketsPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  const { rol, companyId } = session.user

  // La vista con filtros la ven directores + Mesa de Control (los que
  // bucean en la cartera masiva). Coord/cobrador/gerente ven la vista
  // cliente con acciones (sin filtros — sus listas son cortas).
  const isAdminView =
    rol === 'DIRECTOR_GENERAL'
    || rol === 'DIRECTOR_COMERCIAL'
    || rol === 'SUPER_ADMIN'
    || rol === 'MESA_CONTROL'
  if (!isAdminView) {
    return <TicketsClientView />
  }

  const tickets = await prisma.ticket.findMany({
    where: { companyId: companyId! },
    orderBy: { impresoAt: 'desc' },
    take: 500,
    include: {
      branch:     { select: { id: true, nombre: true } },
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

  // Aplanamos a la forma que consume TicketsAdminView (serializable, sin
  // Decimals ni Dates). El client component agrupa por sucursal → empleado
  // despues del filtrado.
  const rows: AdminTicketRow[] = tickets.map((t) => ({
    id:             t.id,
    numeroTicket:   t.numeroTicket,
    esReimpresion:  t.esReimpresion,
    anulado:        t.anulado,
    impresoAt:      t.impresoAt.toISOString(),
    impresoPorId:   t.impresoPorId,
    branchId:       t.branchId,
    branchNombre:   t.branch.nombre,
    empleadoNombre: t.impresoPor.nombre,
    empleadoRol:    t.impresoPor.rol,
    clienteNombre:  t.payment.client.nombreCompleto,
    monto:          Number(t.payment.monto),
    metodoPago:     t.payment.metodoPago,
  }))

  return <TicketsAdminView tickets={rows} />
}
