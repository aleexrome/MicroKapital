'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logoutAction } from '@/app/actions/logout'
import { cn } from '@/lib/utils'
import { UserRole } from '@prisma/client'
import {
  LayoutDashboard,
  Users,
  CreditCard,
  ClipboardCheck,
  CalendarDays,
  History,
  Wallet,
  Ticket,
  BarChart3,
  LogOut,
  Building2,
  CheckSquare,
  ArrowLeftRight,
  Archive,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  roles: UserRole[]
}

// Roles con acceso completo de dirección
const DIRECTORES: UserRole[] = ['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL']
// Roles operativos de campo
const CAMPO: UserRole[] = ['COORDINADOR', 'COBRADOR']

const NAV_ITEMS: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard className="h-5 w-5" />,
    roles: ['GERENTE', 'DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'GERENTE_ZONAL'],
  },
  {
    href: '/clientes',
    label: 'Cartera de Clientes',
    icon: <Users className="h-5 w-5" />,
    roles: ['GERENTE', 'COBRADOR', 'COORDINADOR', 'GERENTE_ZONAL', 'DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL'],
  },
  {
    href: '/prestamos',
    label: 'Solicitudes',
    icon: <CreditCard className="h-5 w-5" />,
    roles: ['GERENTE', 'COBRADOR', 'COORDINADOR', 'GERENTE_ZONAL', 'DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL'],
  },
  {
    href: '/prestamos/aprobaciones',
    label: 'Aprobaciones',
    icon: <CheckSquare className="h-5 w-5" />,
    // EXCLUSIVO del Director General
    roles: ['DIRECTOR_GENERAL'],
  },
  {
    href: '/cobros/agenda',
    label: 'Pactados del Día',
    icon: <CalendarDays className="h-5 w-5" />,
    roles: ['COBRADOR', 'COORDINADOR'],
  },
  {
    href: '/cobros/historial',
    label: 'Cobranza',
    icon: <History className="h-5 w-5" />,
    roles: ['COBRADOR', 'COORDINADOR', 'GERENTE', 'GERENTE_ZONAL'],
  },
  {
    href: '/caja',
    label: 'Corte del Día',
    icon: <Wallet className="h-5 w-5" />,
    roles: ['COBRADOR', 'COORDINADOR', 'GERENTE'],
  },
  {
    href: '/tickets',
    label: 'Tickets',
    icon: <Ticket className="h-5 w-5" />,
    roles: ['COBRADOR', 'COORDINADOR', 'GERENTE'],
  },
  {
    href: '/transferencias',
    label: 'Transferencias',
    icon: <ArrowLeftRight className="h-5 w-5" />,
    roles: ['GERENTE', 'GERENTE_ZONAL'],
  },
  {
    href: '/creditos-concluidos',
    label: 'Créditos Concluidos',
    icon: <Archive className="h-5 w-5" />,
    roles: ['GERENTE', 'COBRADOR', 'COORDINADOR', 'GERENTE_ZONAL', 'DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL'],
  },
  {
    href: '/reportes',
    label: 'Reportes',
    icon: <BarChart3 className="h-5 w-5" />,
    roles: ['GERENTE', 'GERENTE_ZONAL', 'DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL'],
  },
]

// Etiquetas de rol visibles en el sidebar
const ROL_ETIQUETAS: Partial<Record<UserRole, string>> = {
  SUPER_ADMIN:        'Administrador del Sistema',
  DIRECTOR_GENERAL:   'Director General',
  DIRECTOR_COMERCIAL: 'Director Comercial',
  GERENTE_ZONAL:      'Gerente Zonal',
  COORDINADOR:        'Coordinador de Crédito',
  GERENTE:            'Gerente',
  COBRADOR:           'Cobrador',
  CLIENTE:            'Cliente',
}

interface SidebarProps {
  userRole: UserRole
  userName: string
  companyName?: string
  branchName?: string
  onNavClick?: () => void
}

export function Sidebar({ userRole, userName, companyName, branchName, onNavClick }: SidebarProps) {
  const pathname = usePathname()

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(userRole))

  return (
    <aside className="flex h-full flex-col bg-primary-700 text-white w-64 min-w-[256px]">
      {/* Logo / Empresa */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-primary-600">
        <div className="bg-white/10 rounded-lg p-2">
          <Building2 className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 overflow-hidden">
          <p className="text-sm font-semibold truncate">{companyName ?? 'MicroKapital'}</p>
          {branchName && (
            <p className="text-xs text-primary-200 truncate">{branchName}</p>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {visibleItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavClick}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-white/20 text-white'
                  : 'text-primary-200 hover:bg-white/10 hover:text-white'
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User info + logout */}
      <div className="border-t border-primary-600 p-4">
        <div className="mb-3">
          <p className="text-sm font-medium text-white truncate">{userName}</p>
          <p className="text-xs text-primary-200">
            {ROL_ETIQUETAS[userRole] ?? userRole}
          </p>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-primary-200 hover:text-white hover:bg-white/10"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </form>
      </div>
    </aside>
  )
}
