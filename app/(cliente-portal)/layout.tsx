import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { signOut } from 'next-auth/react'
import { Building2 } from 'lucide-react'
import { Toaster } from '@/components/ui/toaster'

export default async function ClientePortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()

  if (!session?.user) redirect('/login')
  if (session.user.rol !== 'CLIENTE') redirect('/dashboard')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-primary-700 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          <span className="font-semibold">Mi Portal</span>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/mi-cuenta" className="hover:text-primary-200">Mi cuenta</Link>
          <Link href="/mis-pagos" className="hover:text-primary-200">Mis pagos</Link>
          <Link href="/mis-documentos" className="hover:text-primary-200">Documentos</Link>
        </nav>
      </header>
      <main className="max-w-2xl mx-auto p-4">
        {children}
      </main>
      <Toaster />
    </div>
  )
}
