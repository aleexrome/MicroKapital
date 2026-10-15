export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { PipelineCortesView } from '@/components/banca/PipelineCortesView'
import { Landmark } from 'lucide-react'

/**
 * Vista Banca — Pipeline del Corte del Día.
 *
 * Muestra el movimiento del dinero por sucursal × estado del corte:
 *   - En campo         → cortes ABIERTO (coord aún no entregó)
 *   - Esperando concentrador  → ENTREGADO dirigido a concentrador local
 *   - En concentrador  → ACEPTADO por concentrador (en manos de él, aún no
 *                        entregado a DG/DC)
 *   - Esperando DG/DC  → ENTREGADO dirigido a DG/DC/SA
 *   - Cerrado          → ACEPTADO por DG/DC (fin del pipeline)
 *
 * Permisos: DG / DC / SA / MC (los que ya ven /banca).
 */
export default async function BancaCortesPage({
  searchParams,
}: {
  searchParams: { fecha?: string }
}) {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  const permitido = ['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'SUPER_ADMIN', 'MESA_CONTROL'].includes(session.user.rol)
  if (!permitido) redirect('/dashboard')

  const { companyId } = session.user

  // Fecha por default: hoy MX
  const fechaStr = searchParams.fecha ?? new Date().toISOString().slice(0, 10)

  // Cortes del día filtrado — join user, receptor, branch.
  const cortes = await prisma.corte.findMany({
    where: {
      companyId: companyId!,
      fecha:     new Date(fechaStr),
    },
    include: {
      user:     { select: { id: true, nombre: true, rol: true } },
      receptor: { select: { id: true, nombre: true, rol: true } },
      branch:   { select: { id: true, nombre: true } },
    },
    orderBy: [{ branchId: 'asc' }, { user: { nombre: 'asc' } }],
  })

  const branches = await prisma.branch.findMany({
    where:   { companyId: companyId!, activa: true },
    orderBy: { nombre: 'asc' },
    include: { concentrador: { select: { id: true, nombre: true } } },
  })

  const cortesDTO = cortes.map((c) => ({
    id:                        c.id,
    estado:                    c.estado,
    user:                      c.user,
    branchId:                  c.branchId,
    branchNombre:              c.branch.nombre,
    receptor:                  c.receptor,
    totalEfectivoCobrado:      Number(c.totalEfectivoCobrado),
    totalTarjetaCobrado:       Number(c.totalTarjetaCobrado),
    totalTransferenciaCobrado: Number(c.totalTransferenciaCobrado),
    totalRecibidoDeOtros:      Number(c.totalRecibidoDeOtros),
    totalAEntregar:            Number(c.totalAEntregar),
    montoAceptado:             c.montoAceptado ? Number(c.montoAceptado) : null,
    entregadoAt:               c.entregadoAt?.toISOString() ?? null,
    aceptadoAt:                c.aceptadoAt?.toISOString() ?? null,
    rechazadoAt:               c.rechazadoAt?.toISOString() ?? null,
    rechazoRazon:              c.rechazoRazon,
    fotoTicketUrl:             c.fotoTicketUrl,
  }))

  const branchesDTO = branches.map((b) => ({
    id:            b.id,
    nombre:        b.nombre,
    concentrador:  b.concentrador,
  }))

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-gray-900 text-white rounded-lg p-2">
          <Landmark className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Banca — Pipeline del Corte del Día</h1>
          <p className="text-muted-foreground text-sm">
            Movimiento del dinero por sucursal: en campo → concentrador → DG/DC.
          </p>
        </div>
      </div>

      <PipelineCortesView
        cortes={cortesDTO}
        branches={branchesDTO}
        fechaInicial={fechaStr}
      />
    </div>
  )
}
