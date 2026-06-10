import { Loader2 } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Validando pago',
  description: 'Estamos validando tu pago. Espera un momento.',
}

/**
 * Pantalla de "mantenimiento" — se sirve cuando la env var
 * MAINTENANCE_MODE === 'true'. El middleware reescribe cualquier ruta a
 * /mantenimiento, por lo que ningún usuario puede pasar de aquí sin
 * importar la URL que escriba. Estética intencionalmente tranquilizadora:
 * fondo negro, ícono naranja girando y mensaje de "validando pago" para
 * que el usuario solo espere sin intentar volver a entrar.
 */
export default function MantenimientoPage() {
  return (
    <div className="min-h-screen w-full bg-black text-white flex flex-col items-center justify-center px-6 py-12">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <Loader2
            className="h-24 w-24 md:h-28 md:w-28 text-orange-500 animate-spin drop-shadow-[0_0_20px_rgba(249,115,22,0.4)]"
            strokeWidth={1.75}
          />
        </div>

        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          Estamos validando tu pago
        </h1>

        <p className="text-base md:text-lg text-gray-300 leading-relaxed">
          Espera un momento para continuar disfrutando de tu página web.
        </p>
      </div>
    </div>
  )
}
