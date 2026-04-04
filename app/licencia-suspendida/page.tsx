import { Building2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function LicenciaSuspendidaPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="bg-red-100 rounded-full p-6">
            <AlertCircle className="h-12 w-12 text-red-600" />
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-gray-900">Acceso suspendido</h1>
          <p className="mt-2 text-gray-600">
            El acceso al sistema ha sido suspendido temporalmente. Por favor, contacta al administrador
            del sistema para resolver cualquier asunto pendiente.
          </p>
        </div>

        <div className="bg-white rounded-lg border p-4 text-left space-y-2">
          <p className="text-sm font-medium text-gray-700">Soporte técnico del sistema</p>
          <p className="text-xs text-gray-500">
            Si crees que esto es un error, comunícate con el equipo de soporte para reactivar tu cuenta.
          </p>
        </div>

        <Button asChild variant="outline" className="w-full">
          <Link href="/login">Volver al inicio de sesión</Link>
        </Button>
      </div>
    </div>
  )
}
