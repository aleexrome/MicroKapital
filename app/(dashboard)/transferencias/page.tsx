import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { scopedLoanWhere } from '@/lib/access'
import { TransferenciasView, type TransferRow } from '@/components/transferencias/TransferenciasView'

export default async function TransferenciasPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  const { rol, companyId } = session.user

  const payments = await prisma.payment.findMany({
    where: {
      metodoPago: 'TRANSFER',
      loan: {
        companyId: companyId!,
        AND: [scopedLoanWhere(session.user)],
      },
    },
    orderBy: [
      { statusTransferencia: 'asc' }, // PENDIENTE antes que VERIFICADO alfabéticamente
      { fechaHora: 'desc' },
    ],
    select: {
      id: true,
      monto: true,
      fechaHora: true,
      idTransferencia: true,
      statusTransferencia: true,
      verificadoAt: true,
      cuentaDestino: { select: { banco: true, titular: true, clabe: true } },
      cobrador: { select: { nombre: true } },
      verificadoPor: { select: { nombre: true } },
      client: { select: { nombreCompleto: true } },
      loan: { select: { tipo: true } },
    },
    take: 300,
  })

  const rows: TransferRow[] = payments.map((p) => ({
    id: p.id,
    monto: p.monto.toString(),
    fechaHora: p.fechaHora.toISOString(),
    idTransferencia: p.idTransferencia,
    statusTransferencia: p.statusTransferencia,
    verificadoAt: p.verificadoAt ? p.verificadoAt.toISOString() : null,
    cuentaDestino: p.cuentaDestino,
    cobrador: p.cobrador,
    verificadoPor: p.verificadoPor,
    client: p.client,
    loan: p.loan,
  }))

  const puedeVerificar =
    rol === 'DIRECTOR_GENERAL' ||
    rol === 'DIRECTOR_COMERCIAL' ||
    rol === 'GERENTE_ZONAL' ||
    rol === 'GERENTE' ||
    rol === 'SUPER_ADMIN'

  return <TransferenciasView rows={rows} puedeVerificar={puedeVerificar} rol={rol} />
}
