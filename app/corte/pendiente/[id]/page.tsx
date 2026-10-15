import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { receptoresValidosPara } from '@/lib/cortes'
import { CorteCongeladoForm } from '@/components/cortes/CorteCongeladoForm'

/**
 * Pantalla congelada del Corte del día — se muestra al user que tiene
 * un corte pendiente (del día o de días pasados). Vive FUERA del grupo
 * (dashboard) para no heredar sidebar / topbar: el user no puede
 * navegar hasta cerrar su corte.
 *
 * El layout del (dashboard) también redirige aquí cuando detecta
 * pendientes, para cubrir el caso de que el user intente abrir
 * /dashboard directamente.
 *
 * Estados posibles:
 *   - ABIERTO    → form con totales + selector de receptor + upload foto
 *   - ENTREGADO  → "esperando aceptación de X" + botón para ver foto
 *   - RECHAZADO  → mostrar razón + botón "re-entregar" (vuelve a ABIERTO en memoria)
 *   - ACEPTADO   → no debería llegar aquí (no bloquea); redirect a /dashboard
 */
export default async function CortePendientePage({
  params,
}: {
  params: { id: string }
}) {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  const corte = await prisma.corte.findFirst({
    where: {
      id:        params.id,
      userId:    session.user.id,
      companyId: session.user.companyId!,
    },
    include: {
      receptor: { select: { id: true, nombre: true, rol: true } },
      branch:   { select: { id: true, nombre: true } },
    },
  })

  if (!corte) redirect('/dashboard')
  if (corte.estado === 'ACEPTADO') redirect('/dashboard')

  const receptoresDisponibles = await receptoresValidosPara(prisma, {
    id:        session.user.id,
    branchId:  session.user.branchId,
    companyId: session.user.companyId,
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-900 via-primary-950 to-black flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl border-2 border-fuchsia-500/50 bg-primary-900/80 backdrop-blur-xl shadow-2xl overflow-hidden">
        <div className="p-6 space-y-5">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-500/40 bg-fuchsia-500/15 px-3 py-1 text-xs font-semibold text-fuchsia-200 uppercase tracking-wider">
              Corte del día
            </div>
            <h1 className="text-2xl font-bold text-white mt-3">
              {corte.estado === 'ENTREGADO'
                ? 'Esperando aceptación'
                : corte.estado === 'RECHAZADO'
                  ? 'Tu corte fue rechazado'
                  : 'Entrega tu corte para continuar'}
            </h1>
            <p className="text-sm text-gray-300 mt-1">
              {corte.estado === 'ENTREGADO'
                ? 'El receptor debe confirmar que recibió el monto para que puedas seguir usando el sistema.'
                : corte.estado === 'RECHAZADO'
                  ? 'Lee la razón, ajusta y vuelve a entregar con nueva foto.'
                  : 'Revisa los totales, elige a quién le vas a entregar, imprime el ticket, obtén la firma y sube la foto.'}
            </p>
          </div>

          <CorteCongeladoForm
            corteId={corte.id}
            estado={corte.estado}
            fecha={corte.fecha.toISOString()}
            branchNombre={corte.branch.nombre}
            totalEfectivoCobrado={Number(corte.totalEfectivoCobrado)}
            totalTarjetaCobrado={Number(corte.totalTarjetaCobrado)}
            totalTransferenciaCobrado={Number(corte.totalTransferenciaCobrado)}
            totalRecibidoDeOtros={Number(corte.totalRecibidoDeOtros)}
            totalAEntregar={Number(corte.totalAEntregar)}
            receptorActual={corte.receptor}
            receptoresDisponibles={receptoresDisponibles}
            fotoTicketUrl={corte.fotoTicketUrl}
            rechazoRazon={corte.rechazoRazon}
          />

          <p className="text-[11px] text-amber-300/80 border-t border-primary-700/50 pt-3 text-center">
            No podrás usar el sistema hasta que el receptor acepte tu corte.
            Si hubo discrepancia y rechazaron, re-entrega con el monto correcto.
          </p>
        </div>
      </div>
    </div>
  )
}
