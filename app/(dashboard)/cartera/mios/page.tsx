import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { formatMoney } from '@/lib/utils'
import { Users, UserCheck, Zap, Landmark } from 'lucide-react'

const TIPOS = [
  { key: 'SOLIDARIO',  label: 'Solidario',  icon: <Users     className="h-6 w-6" />, color: 'bg-blue-50 border-blue-200 text-blue-700' },
  { key: 'INDIVIDUAL', label: 'Individual', icon: <UserCheck className="h-6 w-6" />, color: 'bg-purple-50 border-purple-200 text-purple-700' },
  { key: 'AGIL',       label: 'Ágil',       icon: <Zap       className="h-6 w-6" />, color: 'bg-yellow-50 border-yellow-200 text-yellow-700' },
  { key: 'FIDUCIARIO', label: 'Fiduciario', icon: <Landmark  className="h-6 w-6" />, color: 'bg-green-50 border-green-200 text-green-700' },
]

export default async function CarteraMiosPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  const { rol, companyId, id: userId } = session.user
  if (rol !== 'COORDINADOR' && rol !== 'COBRADOR') redirect('/dashboard')

  const [counts, capitals] = await Promise.all([
    prisma.loan.groupBy({
      by: ['tipo'],
      where: { companyId: companyId!, estado: 'ACTIVE', cobradorId: userId },
      _count: { _all: true },
    }),
    prisma.loan.groupBy({
      by: ['tipo'],
      where: { companyId: companyId!, estado: 'ACTIVE', cobradorId: userId },
      _sum: { capital: true },
    }),
  ])

  const countMap:   Record<string, number> = {}
  const capitalMap: Record<string, number> = {}
  counts.forEach((r)   => { countMap[r.tipo]   = r._count._all })
  capitals.forEach((r) => { capitalMap[r.tipo] = Number(r._sum.capital ?? 0) })

  const totalActivos = Object.values(countMap).reduce((s, v) => s + v, 0)
  const totalCapital = Object.values(capitalMap).reduce((s, v) => s + v, 0)

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mi Cartera</h1>
        <p className="text-muted-foreground text-sm">
          {totalActivos} crédito(s) activo(s) · {formatMoney(totalCapital)} en cartera
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {TIPOS.map((t) => {
          const count   = countMap[t.key]   ?? 0
          const capital = capitalMap[t.key] ?? 0
          return (
            <Link key={t.key} href={`/cartera/mios/${t.key}`}>
              <Card className={`border hover:shadow-md transition-shadow cursor-pointer ${count === 0 ? 'opacity-50' : ''}`}>
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`rounded-lg p-2 border ${t.color}`}>{t.icon}</div>
                    <p className="font-semibold text-gray-900">{t.label}</p>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{count}</p>
                  <p className="text-sm text-muted-foreground">crédito(s) activo(s)</p>
                  {capital > 0 && (
                    <p className="text-sm font-semibold text-green-700 mt-1">{formatMoney(capital)}</p>
                  )}
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
