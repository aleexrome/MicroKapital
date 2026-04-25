import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { CortePrintView } from '@/components/caja/CortePrintView'

function parseFecha(dateStr?: string): Date {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return today
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date > today ? today : date
}

export default async function ImprimirCortePage({
  searchParams,
}: {
  searchParams: { fecha?: string }
}) {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  const { companyId } = session.user

  const cobrador = await prisma.user.findFirst({
    where: { companyId: companyId!, email: session.user.email! },
    include: {
      company: { select: { nombre: true } },
      branch:  { select: { nombre: true } },
    },
  })
  if (!cobrador) redirect('/login')

  const selectedDate = parseFecha(searchParams.fecha)
  const nextDay = new Date(selectedDate)
  nextDay.setDate(nextDay.getDate() + 1)

  const pagos = await prisma.payment.findMany({
    where: {
      cobradorId: cobrador.id,
      fechaHora: { gte: selectedDate, lt: nextDay },
    },
    select: {
      id: true,
      monto: true,
      metodoPago: true,
      statusTransferencia: true,
      fechaHora: true,
      cambioEntregado: true,
      client: { select: { nombreCompleto: true } },
    },
    orderBy: { fechaHora: 'asc' },
  })

  const totalEfectivo = pagos
    .filter((p) => p.metodoPago === 'CASH')
    .reduce((sum, p) => sum + Number(p.monto), 0)
  const totalTarjeta = pagos
    .filter((p) => p.metodoPago === 'CARD')
    .reduce((sum, p) => sum + Number(p.monto), 0)
  const totalTransferenciaVerificada = pagos
    .filter((p) => p.metodoPago === 'TRANSFER' && p.statusTransferencia === 'VERIFICADO')
    .reduce((sum, p) => sum + Number(p.monto), 0)
  const totalEnValidacion = pagos
    .filter((p) => p.metodoPago === 'TRANSFER' && p.statusTransferencia === 'PENDIENTE')
    .reduce((sum, p) => sum + Number(p.monto), 0)
  const totalCambio = pagos.reduce((sum, p) => sum + Number(p.cambioEntregado), 0)
  const totalGeneral = totalEfectivo + totalTarjeta + totalTransferenciaVerificada

  // Sucursal: la del cobrador o, si es director/gerente sin sucursal asignada,
  // intentamos derivar de los pagos del día.
  const sucursalNombre = cobrador.branch?.nombre
    ?? 'Sin sucursal'

  return (
    <CortePrintView
      empresa={cobrador.company.nombre}
      sucursal={sucursalNombre}
      cobrador={cobrador.nombre}
      fecha={selectedDate.toISOString()}
      pagos={pagos.map((p) => ({
        cliente: p.client.nombreCompleto,
        monto: Number(p.monto),
        metodo: p.metodoPago,
        statusTransferencia: p.statusTransferencia ?? null,
      }))}
      totales={{
        efectivo: totalEfectivo,
        tarjeta: totalTarjeta,
        transferenciaVerificada: totalTransferenciaVerificada,
        enValidacion: totalEnValidacion,
        cambio: totalCambio,
        general: totalGeneral,
      }}
    />
  )
}
