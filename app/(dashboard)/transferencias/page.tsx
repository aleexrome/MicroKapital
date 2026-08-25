import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { scopedLoanWhere, canVerifyTransfer, type AccessUser } from '@/lib/access'
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
      loan: {
        select: {
          tipo: true,
          branchId: true,
          branch: { select: { id: true, nombre: true, verificacionCentralizada: true } },
        },
      },
    },
    take: 300,
  })

  const accessUser: AccessUser = {
    id: session.user.id,
    rol,
    branchId: session.user.branchId ?? null,
    zonaBranchIds: session.user.zonaBranchIds as string[] | null | undefined,
  }

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
    loan: { tipo: p.loan.tipo },
    // Permiso por fila: DG/DC/MC/SUPER_ADMIN pueden todas; GZ solo las
    // sucursales de su zona que NO son centralizadas.
    puedeVerificar: canVerifyTransfer(accessUser, p.loan.branch),
    sucursalNombre: p.loan.branch.nombre,
  }))

  // Header "puedes verificar algo" — para el subtítulo. Alguien que ve
  // pero no puede verificar nada tiene un mensaje distinto.
  const puedeVerificarAlgo = rows.some((r) => r.puedeVerificar)

  return <TransferenciasView rows={rows} puedeVerificar={puedeVerificarAlgo} rol={rol} />
}
