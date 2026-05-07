import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

function isAuthorized(rol: string): boolean {
  return rol === 'SUPER_ADMIN' || rol === 'DIRECTOR_GENERAL'
}

export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!isAuthorized(session.user.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { companyId } = session.user
  if (!companyId) return NextResponse.json({ error: 'Empresa requerida' }, { status: 400 })

  // Trae todas las sucursales activas de la empresa.
  const branches = await prisma.branch.findMany({
    where: { companyId, activa: true },
    select: { id: true, nombre: true },
    orderBy: { nombre: 'asc' },
  })

  // LEFT JOIN manual: trae las configs existentes y mapea por branchId.
  const configs = await prisma.branchContractConfig.findMany({
    where: { branchId: { in: branches.map((b) => b.id) } },
  })
  const configByBranch = new Map(configs.map((c) => [c.branchId, c]))

  const data = branches.map((b) => {
    const c = configByBranch.get(b.id)
    return {
      branchId: b.id,
      branchNombre: b.nombre,
      codigoSucursal: c?.codigoSucursal ?? null,
      ciudad: c?.ciudad ?? null,
      diaCobro: c?.diaCobro ?? null,
      horaLimiteCobro: c?.horaLimiteCobro ?? null,
      folioYear: c?.folioYear ?? null,
      folioLastNumber: c?.folioLastNumber ?? null,
    }
  })

  return NextResponse.json({ data })
}
