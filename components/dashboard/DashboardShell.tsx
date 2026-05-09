'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'
import { UserRole } from '@prisma/client'
import { Sidebar } from './Sidebar'
import { FloatingActionsCluster } from '@/components/FloatingActionsCluster'
import type { BranchTreeData } from '@/types/tree'

interface DashboardShellProps {
  userId: string
  userRole: UserRole
  userName: string
  companyName?: string
  branchName?: string
  treeData?: BranchTreeData[]
  children: React.ReactNode
}

export function DashboardShell({
  userId,
  userRole,
  userName,
  companyName,
  branchName,
  treeData = [],
  children,
}: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const sidebarProps = { userRole, userName, companyName, branchName, treeData }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar desktop */}
      <div className="hidden md:flex md:flex-shrink-0">
        <Sidebar {...sidebarProps} />
      </div>

      {/* Sidebar móvil */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-50">
            <Sidebar {...sidebarProps} onNavClick={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-primary-700 text-white border-b border-primary-600/50">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1 rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Abrir menú"
          >
            <Menu className="h-6 w-6" />
          </button>
          <span className="font-semibold text-sm truncate">{companyName ?? 'MicroKapital'}</span>
        </div>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
      <FloatingActionsCluster userId={userId} />
    </div>
  )
}
