import { TrafficCone } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Almacenamiento agotado',
  description: 'Tu plan ha alcanzado el límite de almacenamiento.',
}

/**
 * Pantalla de "mantenimiento" — se sirve cuando la env var
 * MAINTENANCE_MODE === 'true'. El middleware reescribe cualquier ruta a
 * /mantenimiento, por lo que ningún usuario puede pasar de aquí sin
 * importar la URL que escriba. Estética intencionalmente simple:
 * fondo negro, cono naranja y mensaje de "límite de almacenamiento" para
 * dar la apariencia de un bloqueo por cuota agotada.
 */
export default function MantenimientoPage() {
  return (
    <div className="min-h-screen w-full bg-black text-white flex flex-col items-center justify-center px-6 py-12">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="relative">
            <TrafficCone
              className="h-32 w-32 md:h-40 md:w-40 text-orange-500 drop-shadow-[0_0_20px_rgba(249,115,22,0.4)]"
              strokeWidth={1.5}
            />
          </div>
        </div>

        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          ¡Vaya!
        </h1>

        <p className="text-base md:text-lg text-gray-300 leading-relaxed">
          Parece que has llegado al límite de tu almacenamiento.
        </p>

        <p className="text-sm md:text-base text-gray-400 leading-relaxed">
          Suscríbete al nivel{' '}
          <span className="font-semibold text-orange-400">Pro</span>{' '}
          y sigue disfrutando de tu página web.
        </p>

        <div className="pt-2">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg bg-orange-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/30 hover:bg-orange-600 transition-colors focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2 focus:ring-offset-black"
          >
            Actualizar a Pro
          </button>
        </div>

        <p className="text-xs text-gray-600 pt-8">
          Tu servicio se restaurará automáticamente al actualizar tu plan.
        </p>
      </div>
    </div>
  )
}
