import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Building2, Settings, CreditCard, LayoutDashboard, LogOut, FileText } from 'lucide-react'
import { Toaster } from '@/components/ui/toaster'

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()

  if (!session?.user || session.user.rol !== 'SUPER_ADMIN') {
    redirect('/login')
  }

  const navItems = [
    { href: '/sys-mnt-9x7k/panel', label: 'Panel', icon: LayoutDashboard },
    { href: '/sys-mnt-9x7k/empresas', label: 'Empresas', icon: Building2 },
    { href: '/sys-mnt-9x7k/licencias', label: 'Licencias', icon: CreditCard },
  ]

  return (
    <div className="flex h-screen overflow-hidden bg-gray-900">
      {/* Sidebar del super admin — oscuro para diferenciarlo visualmente */}
      <aside className="w-56 bg-gray-950 text-gray-100 flex flex-col">
        <div className="px-4 py-5 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-yellow-400" />
            <div>
              <p className="text-xs font-bold text-yellow-400 uppercase tracking-wider">Sistema Admin</p>
              <p className="text-xs text-gray-400">Panel de control</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-gray-800 p-3">
          <p className="text-xs text-gray-500 mb-2">Soporte Técnico del Sistema</p>
          <Link
            href="/api/auth/signout"
            className="flex items-center gap-2 text-xs text-gray-400 hover:text-white"
          >
            <LogOut className="h-3 w-3" />
            Cerrar sesión
          </Link>
        </div>
      </aside>

      <div className="flex-1 overflow-y-auto">
        {children}
      </div>

      <Toaster />
    </div>
  )
}
