import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { CortesRecibidosView } from '@/components/cortes/CortesRecibidosView'
import { Inbox } from 'lucide-react'

/**
 * Panel para los receptores de cortes (concentradores locales + DG/DC/SA).
 * Muestra los cortes dirigidos a mí para aceptar o rechazar.
 *
 * Si quien entra NO es receptor de nadie en ningún momento, redirige
 * al dashboard — la ruta no tiene sentido para ellos.
 */
export default async function CortesRecibidosPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  const { id: userId, companyId } = session.user

  // Pre-check: ¿es receptor de ALGÚN corte alguna vez? Si no, no sirve
  // esta pantalla para el user.
  const esReceptorAlguna = await prisma.corte.findFirst({
    where: { receptorId: userId, companyId: companyId! },
    select: { id: true },
  })
  if (!esReceptorAlguna) {
    // Aun así deja la pantalla para que puedan ver "sin pendientes" en
    // el futuro — DG/DC siempre deberían entrar.
    // Si es DG/DC/SA permiten; si no, redirect.
    const esSuperior = ['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'SUPER_ADMIN'].includes(session.user.rol)
    // También concentradores locales (que están en Branch.concentradorUserId)
    const esConcentrador = await prisma.branch.findFirst({
      where: { concentradorUserId: userId },
      select: { id: true },
    })
    if (!esSuperior && !esConcentrador) {
      redirect('/dashboard')
    }
  }

  const cortes = await prisma.corte.findMany({
    where: {
      companyId:  companyId!,
      receptorId: userId,
    },
    orderBy: [{ fecha: 'desc' }, { entregadoAt: 'desc' }],
    take: 100,
    include: {
      user:   { select: { id: true, nombre: true, rol: true } },
      branch: { select: { id: true, nombre: true } },
    },
  })

  const cortesDTO = cortes.map((c) => ({
    id:                        c.id,
    estado:                    c.estado,
    fecha:                     c.fecha.toISOString(),
    user:                      c.user,
    branchNombre:              c.branch.nombre,
    totalEfectivoCobrado:      Number(c.totalEfectivoCobrado),
    totalTarjetaCobrado:       Number(c.totalTarjetaCobrado),
    totalTransferenciaCobrado: Number(c.totalTransferenciaCobrado),
    totalRecibidoDeOtros:      Number(c.totalRecibidoDeOtros),
    totalAEntregar:            Number(c.totalAEntregar),
    fotoTicketUrl:             c.fotoTicketUrl,
    entregadoAt:               c.entregadoAt?.toISOString() ?? null,
    aceptadoAt:                c.aceptadoAt?.toISOString() ?? null,
    montoAceptado:             c.montoAceptado ? Number(c.montoAceptado) : null,
    rechazadoAt:               c.rechazadoAt?.toISOString() ?? null,
    rechazoRazon:              c.rechazoRazon,
  }))

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-gray-900 text-white rounded-lg p-2">
          <Inbox className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cortes recibidos</h1>
          <p className="text-muted-foreground text-sm">
            Cortes que te entregaron para que confirmes la recepción.
            Acepta si el monto es correcto; rechaza con razón si hay discrepancia.
          </p>
        </div>
      </div>

      <CortesRecibidosView cortes={cortesDTO} />
    </div>
  )
}
