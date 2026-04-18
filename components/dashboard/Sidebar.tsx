'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logoutAction } from '@/app/actions/logout'
import { cn } from '@/lib/utils'
import { UserRole } from '@prisma/client'
import {
  LayoutDashboard,
  Users,
  CreditCard,
  CalendarDays,
  CalendarCheck,
  History,
  Wallet,
  Ticket,
  BarChart3,
  LogOut,
  Building2,
  CheckSquare,
  ArrowLeftRight,
  Archive,
  Shield,
  ChevronDown,
  ChevronRight,
  Layers,
  UsersRound,
  Zap,
  Landmark,
  UserCheck,
  Navigation,
} from 'lucide-react'
import type { BranchTreeData } from '@/types/tree'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  roles: UserRole[]
}

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
    roles: ['DIRECTOR_GENERAL'],
  },
  {
    href: '/cobros/pactados',
    label: 'Pactados del día',
    icon: <CalendarCheck className="h-5 w-5" />,
    roles: ['COORDINADOR', 'COBRADOR', 'GERENTE', 'GERENTE_ZONAL', 'DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL'],
  },
  {
    href: '/cobros/agenda',
    label: 'Cobranza',
    icon: <CalendarDays className="h-5 w-5" />,
    roles: ['COORDINADOR', 'COBRADOR', 'GERENTE', 'GERENTE_ZONAL', 'DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL'],
  },
  {
    href: '/cobros/anticipada',
    label: 'Cobranza anticipada',
    icon: <CalendarDays className="h-5 w-5" />,
    roles: ['COORDINADOR', 'COBRADOR', 'GERENTE', 'GERENTE_ZONAL', 'DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL'],
  },
  {
    href: '/rutas',
    label: 'Rutas',
    icon: <Navigation className="h-5 w-5" />,
    roles: ['COORDINADOR', 'COBRADOR', 'GERENTE', 'GERENTE_ZONAL', 'DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'SUPER_ADMIN'],
  },
  {
    href: '/cobros/historial',
    label: 'Historial',
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
  {
    href: '/admin',
    label: 'Administración',
    icon: <Shield className="h-5 w-5" />,
    roles: ['SUPER_ADMIN'],
  },
]

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

// Roles que ven el árbol de cartera
const TREE_ROLES: UserRole[] = [
  'DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'GERENTE_ZONAL', 'GERENTE', 'COORDINADOR', 'COBRADOR'
]

const TIPO_ICON: Record<string, React.ReactNode> = {
  SOLIDARIO:  <UsersRound className="h-3.5 w-3.5" />,
  INDIVIDUAL: <UserCheck   className="h-3.5 w-3.5" />,
  AGIL:       <Zap         className="h-3.5 w-3.5" />,
  FIDUCIARIO: <Landmark    className="h-3.5 w-3.5" />,
}
const TIPO_LABEL: Record<string, string> = {
  SOLIDARIO: 'Solidario', INDIVIDUAL: 'Individual', AGIL: 'Ágil', FIDUCIARIO: 'Fiduciario',
}
const TIPO_ORDER = ['SOLIDARIO', 'INDIVIDUAL', 'AGIL', 'FIDUCIARIO']

interface SidebarProps {
  userRole: UserRole
  userName: string
  companyName?: string
  branchName?: string
  treeData?: BranchTreeData[]
  onNavClick?: () => void
}

export function Sidebar({
  userRole,
  userName,
  companyName,
  branchName,
  treeData = [],
  onNavClick,
}: SidebarProps) {
  const pathname = usePathname()
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(new Set())
  const [treeOpen, setTreeOpen] = useState(false)

  function toggleBranch(id: string) {
    setExpandedBranches((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(userRole))
  const showTree = TREE_ROLES.includes(userRole) && treeData.length > 0

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <aside className="flex h-full flex-col bg-primary-700 text-white w-64 min-w-[256px]">
      {/* Logo / Empresa */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-primary-600/60">
        <div className="bg-primary-500/20 rounded-xl p-2.5 ring-1 ring-primary-500/30">
          <Building2 className="h-5 w-5 text-primary-300" />
        </div>
        <div className="flex-1 overflow-hidden">
          <p className="text-sm font-bold truncate text-white">{companyName ?? 'MicroKapital'}</p>
          {branchName && <p className="text-xs text-primary-300 truncate">{branchName}</p>}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {/* Nav items normales */}
        {visibleItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavClick}
            className={cn(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150',
              isActive(item.href)
                ? 'bg-primary-500 text-white shadow-glow'
                : 'text-primary-200 hover:bg-white/8 hover:text-white'
            )}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}

        {/* Árbol de Cartera */}
        {showTree && (
          <div className="pt-3 mt-1 border-t border-primary-600/50">
            <button
              onClick={() => setTreeOpen((v) => !v)}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm font-medium text-primary-200 hover:bg-white/8 hover:text-white transition-all duration-150"
            >
              <Layers className="h-5 w-5" />
              <span className="flex-1 text-left">Árbol de Cartera</span>
              {treeOpen
                ? <ChevronDown className="h-4 w-4 shrink-0" />
                : <ChevronRight className="h-4 w-4 shrink-0" />
              }
            </button>

            {treeOpen && (
              <div className="mt-1 space-y-0.5">
                {treeData.map((branch) => {
                  const isExpanded = expandedBranches.has(branch.id)
                  const totalActivos = Object.values(branch.counts).reduce((s, c) => s + c, 0)
                  const tiposConDatos = TIPO_ORDER.filter((t) => branch.counts[t] > 0)

                  return (
                    <div key={branch.id}>
                      {/* Branch node: nombre = link, flecha = expand */}
                      <div className="flex items-center">
                        <Link
                          href={branch.ownOnly ? '/cartera/mios' : `/cartera/${branch.id}`}
                          onClick={onNavClick}
                          className={cn(
                            'flex-1 flex items-center gap-2 pl-6 pr-2 py-2 rounded-l-xl text-xs font-medium transition-all duration-150',
                            isActive(branch.ownOnly ? '/cartera/mios' : `/cartera/${branch.id}`)
                              ? 'bg-primary-500 text-white'
                              : 'text-primary-100 hover:bg-white/8 hover:text-white'
                          )}
                        >
                          <Building2 className="h-3.5 w-3.5 shrink-0 text-primary-300" />
                          <span className="flex-1 truncate">{branch.nombre}</span>
                          <span className="bg-white/10 text-primary-200 rounded-full px-1.5 py-0.5 text-[10px] shrink-0">
                            {totalActivos}
                          </span>
                        </Link>
                        <button
                          onClick={() => toggleBranch(branch.id)}
                          className="pr-3 py-2 text-primary-300 hover:text-white transition-colors"
                          title={isExpanded ? 'Colapsar' : 'Expandir'}
                        >
                          {isExpanded
                            ? <ChevronDown className="h-3 w-3" />
                            : <ChevronRight className="h-3 w-3" />
                          }
                        </button>
                      </div>

                      {/* Product nodes */}
                      {isExpanded && (
                        <div className="ml-2">
                          {tiposConDatos.length === 0 && (
                            <p className="pl-10 py-1.5 text-[11px] text-primary-400 italic">Sin créditos activos</p>
                          )}
                          {tiposConDatos.map((tipo) => {
                            const count = branch.counts[tipo]
                            const href = branch.ownOnly
                              ? `/cartera/mios/${tipo}`
                              : `/cartera/${branch.id}/${tipo}`
                            const active = pathname === href

                            return (
                              <Link
                                key={tipo}
                                href={href}
                                onClick={onNavClick}
                                className={cn(
                                  'flex items-center gap-2 pl-10 pr-3 py-2 rounded-xl text-[11px] transition-all duration-150',
                                  active
                                    ? 'bg-primary-500 text-white font-semibold'
                                    : 'text-primary-200 hover:bg-white/8 hover:text-white'
                                )}
                              >
                                <span className="text-primary-300">{TIPO_ICON[tipo]}</span>
                                <span className="flex-1">{TIPO_LABEL[tipo]}</span>
                                <span className={cn(
                                  'rounded-full px-1.5 py-0.5 text-[10px]',
                                  active ? 'bg-white/20' : 'bg-white/10 text-primary-300'
                                )}>
                                  {count}
                                </span>
                              </Link>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* User info + logout */}
      <div className="border-t border-primary-600/50 p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="bg-primary-500/20 rounded-xl p-2 ring-1 ring-primary-500/25 shrink-0">
            <span className="text-primary-300 text-xs font-bold">
              {userName.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{userName}</p>
            <p className="text-xs text-primary-300 truncate">{ROL_ETIQUETAS[userRole] ?? userRole}</p>
          </div>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-primary-200 hover:text-white hover:bg-white/8 transition-all duration-150"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </form>
      </div>
    </aside>
  )
}
