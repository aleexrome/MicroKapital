import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatMoney } from '@/lib/utils'
import { ArrowLeft, Users, UserCheck, Zap, Landmark } from 'lucide-react'

const TIPOS = [
  { key: 'SOLIDARIO',  label: 'Solidario',  icon: <Users      className="h-5 w-5" />, color: 'bg-blue-50 border-blue-200 text-blue-700' },
  { key: 'INDIVIDUAL', label: 'Individual', icon: <UserCheck  className="h-5 w-5" />, color: 'bg-purple-50 border-purple-200 text-purple-700' },
  { key: 'AGIL',       label: 'Ágil',       icon: <Zap        className="h-5 w-5" />, color: 'bg-yellow-50 border-yellow-200 text-yellow-700' },
  { key: 'FIDUCIARIO', label: 'Fiduciario', icon: <Landmark   className="h-5 w-5" />, color: 'bg-green-50 border-green-200 text-green-700' },
]

export default async function CarteraBranchPage({ params }: { params: { branchId: string } }) {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  const { rol, companyId } = session.user

  const branch = await prisma.branch.findFirst({
    where: { id: params.branchId, companyId: companyId!, activa: true },
    select: { id: true, nombre: true },
  })
  if (!branch) notFound()

  // Counts + capital per tipo
  const [counts, capitals] = await Promise.all([
    prisma.loan.groupBy({
      by: ['tipo'],
      where: { branchId: params.branchId, estado: 'ACTIVE', companyId: companyId! },
      _count: { _all: true },
    }),
    prisma.loan.groupBy({
      by: ['tipo'],
      where: { branchId: params.branchId, estado: 'ACTIVE', companyId: companyId! },
      _sum: { capital: true },
    }),
  ])

  const countMap: Record<string, number> = {}
  counts.forEach((r) => { countMap[r.tipo] = r._count._all })
  const capitalMap: Record<string, number> = {}
  capitals.forEach((r) => { capitalMap[r.tipo] = Number(r._sum.capital ?? 0) })

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/dashboard"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{branch.nombre}</h1>
          <p className="text-muted-foreground text-sm">Cartera por producto</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {TIPOS.map((t) => {
          const count   = countMap[t.key] ?? 0
          const capital = capitalMap[t.key] ?? 0
          return (
            <Link key={t.key} href={`/cartera/${branch.id}/${t.key}`}>
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
