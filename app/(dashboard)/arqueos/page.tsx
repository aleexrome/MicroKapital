import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { puedeLanzarArqueo, ROLES_RECIBEN_ARQUEO } from '@/lib/arqueos'
import { ArqueosView } from '@/components/arqueos/ArqueosView'
import { ClipboardList } from 'lucide-react'

/**
 * Pantalla admin de arqueos. Solo DG / DC / SA pueden entrar.
 * Carga server-side: lista de arqueos + usuarios target potenciales
 * (los que SÍ reciben arqueo) + sucursales de la empresa.
 */
export default async function ArqueosPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  if (!puedeLanzarArqueo(session.user.rol)) redirect('/dashboard')

  const companyId = session.user.companyId!

  const [arqueos, usuarios, branches] = await Promise.all([
    prisma.arqueo.findMany({
      where: { companyId },
      orderBy: { lanzadoAt: 'desc' },
      take: 100,
      include: {
        lanzadoPor:   { select: { id: true, nombre: true, rol: true, branch: { select: { nombre: true } } } },
        canceladoPor: { select: { id: true, nombre: true } },
        branch:       { select: { id: true, nombre: true } },
        capturas: {
          include: {
            user: { select: { id: true, nombre: true, rol: true, branch: { select: { id: true, nombre: true } } } },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { companyId, activo: true, rol: { in: [...ROLES_RECIBEN_ARQUEO] } },
      orderBy: [{ branch: { nombre: 'asc' } }, { nombre: 'asc' }],
      select: { id: true, nombre: true, rol: true, branch: { select: { id: true, nombre: true } } },
    }),
    prisma.branch.findMany({
      where: { companyId, activa: true },
      orderBy: { nombre: 'asc' },
      select: { id: true, nombre: true },
    }),
  ])

  // Serializar las fechas y decimals a tipos primitivos.
  const arqueosDTO = arqueos.map((a) => ({
    id:             a.id,
    tipo:           a.tipo,
    branchId:       a.branchId,
    branchNombre:   a.branch?.nombre ?? null,
    lanzadoAt:      a.lanzadoAt.toISOString(),
    lanzadoPor:     a.lanzadoPor,
    canceladoAt:    a.canceladoAt?.toISOString() ?? null,
    canceladoPor:   a.canceladoPor,
    canceladoRazon: a.canceladoRazon,
    capturas: a.capturas.map((c) => ({
      id:                           c.id,
      user:                         c.user,
      capturadoAt:                  c.capturadoAt?.toISOString() ?? null,
      canceladoAt:                  c.canceladoAt?.toISOString() ?? null,
      ultimoVistoAt:                c.ultimoVistoAt?.toISOString() ?? null,
      totalEfectivoDeclarado:       c.totalEfectivoDeclarado ? Number(c.totalEfectivoDeclarado) : null,
      totalTransferenciasDeclarado: c.totalTransferenciasDeclarado ? Number(c.totalTransferenciasDeclarado) : null,
      totalEfectivoEsperado:        c.totalEfectivoEsperado ? Number(c.totalEfectivoEsperado) : null,
      totalTransferenciasEsperado:  c.totalTransferenciasEsperado ? Number(c.totalTransferenciasEsperado) : null,
      desgloseEfectivo:             c.desgloseEfectivo,
      semanaMKSabado:               c.semanaMKSabado?.toISOString() ?? null,
    })),
  }))

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-gray-900 text-white rounded-lg p-2">
          <ClipboardList className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Arqueos sorpresivos</h1>
          <p className="text-muted-foreground text-sm">
            Lanza un arqueo individual, por sucursal o global. Los usuarios target
            no podrán usar el sistema hasta capturar.
          </p>
        </div>
      </div>

      <ArqueosView
        arqueos={arqueosDTO}
        usuarios={usuarios}
        branches={branches}
        yoId={session.user.id}
      />
    </div>
  )
}
