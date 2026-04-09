import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { Toaster } from '@/components/ui/toaster'
import { checkLicense } from '@/lib/license-check'
import type { BranchTreeData } from '@/types/tree'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  const { rol, companyId, branchId, id: userId } = session.user

  if (rol === 'SUPER_ADMIN') redirect('/sys-mnt-9x7k/panel')
  if (rol === 'CLIENTE')     redirect('/mi-cuenta')

  if (companyId) {
    const licenseResult = await checkLicense(companyId)
    if (!licenseResult.allowed) redirect('/licencia-suspendida')
  }

  const isDirector    = rol === 'DIRECTOR_GENERAL' || rol === 'DIRECTOR_COMERCIAL'
  const isGerente     = rol === 'GERENTE_ZONAL' || rol === 'GERENTE'
  const isCoordinador = rol === 'COORDINADOR' || rol === 'COBRADOR'

  // ── Fetch empresa y sucursal ────────────────────────────────────────────────
  let company: { nombre: string } | null = null
  let branch: { nombre: string } | null = null
  try {
    ;[company, branch] = await Promise.all([
      companyId
        ? prisma.company.findUnique({ where: { id: companyId }, select: { nombre: true } })
        : Promise.resolve(null),
      branchId
        ? prisma.branch.findUnique({ where: { id: branchId }, select: { nombre: true } })
        : Promise.resolve(null),
    ])
  } catch (e) {
    console.error('[Layout] Error fetching company/branch:', e)
  }

  // ── Fetch árbol de cartera ──────────────────────────────────────────────────
  let treeData: BranchTreeData[] = []

  try {
    if (isDirector || isGerente) {
      // Determinar rango de sucursales visibles
      let branchIds: string[] | undefined
      if (rol === 'GERENTE_ZONAL') {
        const z = session.user.zonaBranchIds
        branchIds = z && z.length > 0 ? z : undefined
      } else if (rol === 'GERENTE' && branchId) {
        branchIds = [branchId]
      }

      const [branches, loanCounts] = await Promise.all([
        prisma.branch.findMany({
          where: {
            companyId: companyId!,
            activa: true,
            ...(branchIds ? { id: { in: branchIds } } : {}),
          },
          select: { id: true, nombre: true },
          orderBy: { nombre: 'asc' },
        }),
        prisma.loan.groupBy({
          by: ['branchId', 'tipo'],
          where: {
            companyId: companyId!,
            estado: 'ACTIVE',
            ...(branchIds ? { branchId: { in: branchIds } } : {}),
          },
          _count: { _all: true },
        }),
      ])

      // Build map: branchId → tipo → count
      const countMap = new Map<string, Record<string, number>>()
      for (const row of loanCounts) {
        if (!row.branchId) continue
        if (!countMap.has(row.branchId)) countMap.set(row.branchId, {})
        countMap.get(row.branchId)![row.tipo] = row._count._all
      }

      treeData = branches.map((b) => ({
        id: b.id,
        nombre: b.nombre,
        counts: countMap.get(b.id) ?? {},
      }))
    } else if (isCoordinador) {
      // Coordinador/Cobrador: un solo nodo "virtual" con sus propios conteos
      const loanCounts = await prisma.loan.groupBy({
        by: ['tipo'],
        where: { companyId: companyId!, estado: 'ACTIVE', cobradorId: userId },
        _count: { _all: true },
      })

      const counts: Record<string, number> = {}
      for (const row of loanCounts) counts[row.tipo] = row._count._all

      // Single virtual branch using their own branchId (or 'mine')
      treeData = [{
        id: branchId ?? 'mine',
        nombre: branch?.nombre ?? 'Mi cartera',
        counts,
        ownOnly: true,
      }]
    }
  } catch (e) {
    console.error('[Layout] Error fetching tree data:', e)
    // Fail gracefully — app works without tree
    treeData = []
  }

  return (
    <>
      <DashboardShell
        userRole={rol}
        userName={session.user.name ?? ''}
        companyName={company?.nombre ?? ''}
        branchName={branch?.nombre ?? ''}
        treeData={treeData}
      >
        {children}
      </DashboardShell>
      <Toaster />
    </>
  )
}
