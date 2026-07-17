export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Target, DollarSign, Wallet, AlertTriangle, TrendingUp,
  CheckCircle2, BadgeCheck, ChevronRight, ClipboardCheck,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const ALLOWED_ROLES = [
  'SUPER_ADMIN',
  'DIRECTOR_GENERAL',
  'DIRECTOR_COMERCIAL',
  'MESA_CONTROL',
  'GERENTE_ZONAL',
  'GERENTE',
  'COORDINADOR',
  'COBRADOR',
] as const

interface ReporteCard {
  href: string
  titulo: string
  descripcion: string
  icon: typeof Target
  color: string
  iconBg: string
  iconText: string
  /** Si se define, solo los roles listados ven la tarjeta. Sin este
   *  campo, la tarjeta es visible para todos los ALLOWED_ROLES. */
  soloRoles?: readonly string[]
}

const REPORTES: ReporteCard[] = [
  {
    href: '/reportes/cumplimiento',
    titulo: 'Cumplimiento de metas',
    descripcion: 'Avance en tiempo real vs metas semanales definidas por dirección.',
    icon: Target,
    color: 'border-primary-500/40',
    iconBg: 'bg-primary-500/15',
    iconText: 'text-primary-300',
  },
  {
    href: '/reportes/cartera',
    titulo: 'Cartera activa',
    descripcion: 'Total de capital activo, segmentado por sucursal, cobrador y producto.',
    icon: DollarSign,
    color: 'border-blue-500/30',
    iconBg: 'bg-blue-500/15',
    iconText: 'text-blue-400',
  },
  {
    href: '/reportes/cobranza',
    titulo: 'Cobranza',
    descripcion: 'Cobranza efectiva por método (efectivo, tarjeta, transferencia) y periodo.',
    icon: Wallet,
    color: 'border-emerald-500/30',
    iconBg: 'bg-emerald-500/15',
    iconText: 'text-emerald-400',
  },
  {
    href: '/reportes/mora',
    titulo: 'Mora',
    descripcion: 'Cartera vencida por buckets 1-7, 8-15 y 16+ días.',
    icon: AlertTriangle,
    color: 'border-rose-500/30',
    iconBg: 'bg-rose-500/15',
    iconText: 'text-rose-400',
  },
  {
    href: '/reportes/moras',
    titulo: 'Multas y moras cobradas',
    descripcion: 'Multas de $200 (mismo día > 2 pm) y moras de $500 (día siguiente) generadas y cobradas.',
    icon: AlertTriangle,
    color: 'border-amber-500/30',
    iconBg: 'bg-amber-500/15',
    iconText: 'text-amber-400',
  },
  {
    href: '/reportes/colocacion',
    titulo: 'Colocación',
    descripcion: 'Créditos desembolsados en el periodo seleccionado.',
    icon: TrendingUp,
    color: 'border-amber-500/30',
    iconBg: 'bg-amber-500/15',
    iconText: 'text-amber-400',
  },
  {
    href: '/reportes/liquidaciones',
    titulo: 'Liquidaciones',
    descripcion: 'Créditos completados y ciclo de vida promedio.',
    icon: CheckCircle2,
    color: 'border-violet-500/30',
    iconBg: 'bg-violet-500/15',
    iconText: 'text-violet-400',
  },
  {
    href: '/reportes/mesa-control',
    titulo: 'Mesa de Control',
    descripcion: 'Solicitudes revisadas por semana: aprobadas vs regresadas. Hoja imprimible.',
    icon: ClipboardCheck,
    color: 'border-primary-500/30',
    iconBg: 'bg-primary-500/15',
    iconText: 'text-primary-300',
    soloRoles: ['MESA_CONTROL', 'DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'SUPER_ADMIN'],
  },
]

// Roles operativos: MC solo debe ver "Mesa de Control" en el índice
// (los demás reportes son operativos de cobranza que no le competen).
const OPERATIVOS_QUE_MC_NO_VE = new Set([
  '/reportes/cumplimiento',
  '/reportes/cartera',
  '/reportes/cobranza',
  '/reportes/mora',
  '/reportes/moras',
  '/reportes/colocacion',
  '/reportes/liquidaciones',
])

const ADMIN_ROLES = ['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL']

export default async function ReportesPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  const { rol } = session.user
  if (!ALLOWED_ROLES.includes(rol as typeof ALLOWED_ROLES[number])) redirect('/dashboard')

  const puedeDefinirMetas = ADMIN_ROLES.includes(rol)

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reportes</h1>
          <p className="text-muted-foreground text-sm">
            Análisis de cartera, cobranza y cumplimiento de metas.
          </p>
        </div>

        {puedeDefinirMetas && (
          <Link
            href="/reportes/metas"
            className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
          >
            <BadgeCheck className="h-4 w-4 text-primary-300" />
            Administrar metas
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORTES
          .filter((r) => {
            if (r.soloRoles && !r.soloRoles.includes(rol)) return false
            if (rol === 'MESA_CONTROL' && OPERATIVOS_QUE_MC_NO_VE.has(r.href)) return false
            return true
          })
          .map((r) => (
          <Link key={r.href} href={r.href} className="block group">
            <Card className={`overflow-hidden border ${r.color} hover:border-opacity-80 transition-all hover:shadow-glow`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className={`rounded-xl p-2.5 ${r.iconBg}`}>
                    <r.icon className={`h-5 w-5 ${r.iconText}`} />
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
                <h2 className="font-semibold text-foreground mb-1">{r.titulo}</h2>
                <p className="text-xs text-muted-foreground leading-relaxed">{r.descripcion}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-border/40 bg-card/40 p-4 text-xs text-muted-foreground">
        <div className="flex items-start gap-2">
          <Badge variant="info" className="text-[10px]">Tip</Badge>
          <p>
            Cada reporte tiene una versión interactiva en pantalla y un botón
            <strong className="text-foreground"> Imprimir reporte</strong> para
            generar un PDF imprimible. Los filtros de la barra superior
            aplican a todos los datos visibles.
          </p>
        </div>
      </div>
    </div>
  )
}
