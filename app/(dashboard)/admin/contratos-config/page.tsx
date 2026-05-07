import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ContractsCompanyConfigForm } from '@/components/admin/ContractsCompanyConfigForm'
import { ContractsBranchesConfigTable } from '@/components/admin/ContractsBranchesConfigTable'
import { FileText } from 'lucide-react'

export default async function ContractsConfigPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  if (session.user.rol !== 'SUPER_ADMIN' && session.user.rol !== 'DIRECTOR_GENERAL') {
    redirect('/dashboard')
  }

  const { companyId } = session.user
  if (!companyId) redirect('/login')

  // ── Configuración de empresa ───────────────────────────────────────────────
  const companyConfig = await prisma.companyContractConfig.findUnique({
    where: { companyId },
  })

  // ── Sucursales con su config (LEFT JOIN manual) ────────────────────────────
  const branches = await prisma.branch.findMany({
    where: { companyId, activa: true },
    select: { id: true, nombre: true },
    orderBy: { nombre: 'asc' },
  })
  const configs = await prisma.branchContractConfig.findMany({
    where: { branchId: { in: branches.map((b) => b.id) } },
  })
  const configByBranch = new Map(configs.map((c) => [c.branchId, c]))

  const branchesConfig = branches.map((b) => {
    const c = configByBranch.get(b.id)
    return {
      branchId: b.id,
      branchNombre: b.nombre,
      codigoSucursal: c?.codigoSucursal ?? '',
      ciudad: c?.ciudad ?? '',
      diaCobro: c?.diaCobro ?? '',
      horaLimiteCobro: c?.horaLimiteCobro ?? '',
      folioYear: c?.folioYear ?? null,
      folioLastNumber: c?.folioLastNumber ?? null,
    }
  })

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="bg-gray-900 text-white rounded-lg p-2">
          <FileText className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configuración de Contratos</h1>
          <p className="text-muted-foreground text-sm">
            Datos para la generación de contratos — Director General y Super Admin
          </p>
        </div>
      </div>

      {/* Sección 1 — Empresa */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuración de empresa</CardTitle>
        </CardHeader>
        <CardContent>
          <ContractsCompanyConfigForm
            initialData={
              companyConfig
                ? {
                    representanteLegal: companyConfig.representanteLegal,
                    cat: Number(companyConfig.cat),
                    interesMoratorio: Number(companyConfig.interesMoratorio),
                  }
                : null
            }
          />
        </CardContent>
      </Card>

      {/* Sección 2 — Sucursales */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Sucursales ({branchesConfig.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ContractsBranchesConfigTable rows={branchesConfig} />
        </CardContent>
      </Card>
    </div>
  )
}
