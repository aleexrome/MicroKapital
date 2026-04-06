import { redirect } from 'next/navigation'
import { signIn } from '@/lib/auth'

async function loginAction(formData: FormData) {
  'use server'
  const email = (formData.get('email') as string | null) ?? ''
  const password = (formData.get('password') as string | null) ?? ''

  try {
    await signIn('credentials', { email, password, redirectTo: '/dashboard' })
  } catch (e: unknown) {
    // redirect() de Next.js lanza un error especial — re-lanzar para que funcione
    const digest = (e as Record<string, string>)?.digest ?? ''
    if (digest.startsWith('NEXT_REDIRECT')) throw e
    // cualquier otro error = credenciales inválidas
    redirect('/login?error=invalid')
  }
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const errorMsg =
    searchParams.error === 'invalid'
      ? 'Credenciales incorrectas. Verifica tu email y contraseña.'
      : searchParams.error === 'license'
      ? 'Tu empresa no tiene licencia activa.'
      : null

  return (
    <div className="w-full max-w-md rounded-lg border bg-white shadow-2xl">
      <div className="flex flex-col p-6 space-y-1 text-center">
        <div className="flex items-center justify-center mb-4">
          <div className="bg-blue-900 rounded-xl p-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"
              fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/>
              <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>
              <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/>
              <path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>
            </svg>
          </div>
        </div>
        <h1 className="text-2xl font-bold text-blue-900">MicroKapital</h1>
        <p className="text-sm text-gray-500">Ingresa tus credenciales para acceder al sistema</p>
      </div>

      <div className="px-6 pb-6">
        <form action={loginAction} encType="multipart/form-data" className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Correo electrónico
            </label>
            <input id="email" name="email" type="email" placeholder="tu@empresa.com"
              required autoComplete="email"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-900"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Contraseña
            </label>
            <input id="password" name="password" type="password" placeholder="••••••••"
              required autoComplete="current-password"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-900"
            />
          </div>

          {errorMsg && (
            <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
              {errorMsg}
            </div>
          )}

          <button type="submit"
            className="w-full rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-900">
            Iniciar sesión
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-400">
          Sistema de uso exclusivo para personal autorizado
        </p>
      </div>
    </div>
  )
}
