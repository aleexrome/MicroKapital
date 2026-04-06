'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'
import { UserRole } from '@prisma/client'
import { Sidebar } from './Sidebar'

interface DashboardShellProps {
  userRole: UserRole
  userName: string
  companyName?: string
  branchName?: string
  children: React.ReactNode
}

export function DashboardShell({
  userRole,
  userName,
  companyName,
  branchName,
  children,
}: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar desktop — siempre visible en md+ */}
      <div className="hidden md:flex md:flex-shrink-0">
        <Sidebar
          userRole={userRole}
          userName={userName}
          companyName={companyName}
          branchName={branchName}
        />
      </div>

      {/* Sidebar móvil — drawer con backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
          {/* Drawer */}
          <div className="fixed inset-y-0 left-0 z-50">
            <Sidebar
              userRole={userRole}
              userName={userName}
              companyName={companyName}
              branchName={branchName}
              onNavClick={() => setSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar móvil */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-primary-700 text-white">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1 rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Abrir menú"
          >
            <Menu className="h-6 w-6" />
          </button>
          <span className="font-semibold text-sm truncate">
            {companyName ?? 'MicroKapital'}
          </span>
        </div>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
