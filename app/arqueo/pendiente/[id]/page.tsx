import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { ArqueoCapturaForm } from '@/components/arqueos/ArqueoCapturaForm'
import { DENOMINACIONES_MXN } from '@/lib/arqueos'

/**
 * Pantalla CONGELADA — se le muestra al user con una captura pendiente.
 * Vive FUERA del grupo (dashboard) para que no herede sidebar / topbar
 * y el user no pueda navegar a ningún lado.
 *
 * El layout del (dashboard) también redirige a esta ruta cuando detecta
 * pendientes, para cubrir el caso de que el user intente abrir /dashboard
 * directamente.
 */
export default async function ArqueoPendientePage({
  params,
}: {
  params: { id: string } // id = ArqueoCaptura.id (no arqueoId)
}) {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  const captura = await prisma.arqueoCaptura.findFirst({
    where: {
      id:          params.id,
      userId:      session.user.id,
      capturadoAt: null,
      canceladoAt: null,
      arqueo:      { canceladoAt: null },
    },
    include: {
      arqueo: {
        include: {
          lanzadoPor: { select: { nombre: true, rol: true, branch: { select: { nombre: true } } } },
          branch:     { select: { nombre: true } },
        },
      },
    },
  })

  // Si el user quiere entrar a una captura que ya está lista o cancelada,
  // lo mandamos al dashboard — allí el layout decidirá si hay otra pendiente.
  if (!captura) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-900 via-primary-950 to-black flex items-center justify-center p-4">
      <div className="w-full max-w-xl rounded-2xl border-2 border-fuchsia-500/50 bg-primary-900/80 backdrop-blur-xl shadow-2xl overflow-hidden">
        <div className="p-6 space-y-5">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-500/40 bg-fuchsia-500/15 px-3 py-1 text-xs font-semibold text-fuchsia-200 uppercase tracking-wider">
              Arqueo sorpresivo
            </div>
            <h1 className="text-2xl font-bold text-white mt-3">
              Captura tu dinero AHORA
            </h1>
            <p className="text-sm text-gray-300 mt-1">
              Cuenta el efectivo que tienes contigo (billetes y monedas) y declara cuánto has
              cobrado por transferencia esta semana (sábado a viernes).
            </p>
          </div>

          <div className="rounded-lg border border-gray-700 bg-black/30 p-3 text-xs text-gray-300 space-y-1">
            <p>
              <span className="text-gray-400">Lanzado por: </span>
              <span className="text-white font-medium">{captura.arqueo.lanzadoPor?.nombre ?? '—'}</span>
              {captura.arqueo.lanzadoPor?.branch?.nombre && (
                <> · <span className="text-gray-400">{captura.arqueo.lanzadoPor.branch.nombre}</span></>
              )}
            </p>
            <p>
              <span className="text-gray-400">Fecha / hora: </span>
              <span className="text-white">
                {captura.arqueo.lanzadoAt.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
              </span>
            </p>
            {captura.arqueo.tipo === 'BRANCH' && captura.arqueo.branch && (
              <p>
                <span className="text-gray-400">Tipo: </span>
                <span className="text-white">Sucursal — {captura.arqueo.branch.nombre}</span>
              </p>
            )}
            {captura.arqueo.tipo === 'GLOBAL' && (
              <p>
                <span className="text-gray-400">Tipo: </span>
                <span className="text-white">Global (toda la empresa)</span>
              </p>
            )}
            {captura.arqueo.tipo === 'INDIVIDUAL' && (
              <p>
                <span className="text-gray-400">Tipo: </span>
                <span className="text-white">Individual</span>
              </p>
            )}
          </div>

          <ArqueoCapturaForm
            arqueoId={captura.arqueoId}
            denominaciones={[...DENOMINACIONES_MXN]}
          />

          <p className="text-[11px] text-amber-300/80 border-t border-primary-700/50 pt-3 text-center">
            No podrás usar el sistema hasta terminar la captura. Si tienes
            dudas, llama a tu Gerente Zonal o Dirección — este arqueo quedará
            registrado con fecha, hora y quién lo lanzó.
          </p>
        </div>
      </div>
    </div>
  )
}
