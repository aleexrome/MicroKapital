import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { notFound, redirect } from 'next/navigation'
import { EditClienteForm } from './EditClienteForm'

export default async function EditarClientePage({
  params,
}: {
  params: { id: string }
}) {
  const session = await getSession()
  if (!session?.user) return null

  const { rol, companyId } = session.user

  // Solo DIRECTOR_GENERAL puede editar expedientes
  if (rol !== 'DIRECTOR_GENERAL') {
    redirect(`/clientes/${params.id}`)
  }

  const client = await prisma.client.findFirst({
    where: { id: params.id, companyId: companyId! },
    select: {
      id: true,
      nombreCompleto: true,
      telefono: true,
      telefonoAlt: true,
      email: true,
      domicilio: true,
      numIne: true,
      curp: true,
      referenciaNombre: true,
      referenciaTelefono: true,
      fechaNacimiento: true,
      cobradorId: true,
      branchId: true,
    },
  })
  if (!client) notFound()

  // Cobradores/Coordinadores de la misma sucursal — para que DG pueda reasignar
  const cobradores = await prisma.user.findMany({
    where: {
      companyId: companyId!,
      activo: true,
      branchId: client.branchId,
      rol: { in: ['COBRADOR', 'COORDINADOR', 'GERENTE', 'GERENTE_ZONAL'] },
    },
    select: { id: true, nombre: true, rol: true },
    orderBy: { nombre: 'asc' },
  })

  return (
    <EditClienteForm
      cliente={{
        id: client.id,
        nombreCompleto:     client.nombreCompleto,
        telefono:           client.telefono ?? '',
        telefonoAlt:        client.telefonoAlt ?? '',
        email:              client.email ?? '',
        domicilio:          client.domicilio ?? '',
        numIne:             client.numIne ?? '',
        curp:               client.curp ?? '',
        referenciaNombre:   client.referenciaNombre ?? '',
        referenciaTelefono: client.referenciaTelefono ?? '',
        fechaNacimiento:    client.fechaNacimiento
          ? client.fechaNacimiento.toISOString().slice(0, 10)
          : '',
        cobradorId: client.cobradorId ?? '',
      }}
      cobradores={cobradores}
    />
  )
}
