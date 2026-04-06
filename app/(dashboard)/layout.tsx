import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/dashboard/Sidebar'
import { Toaster } from '@/components/ui/toaster'
import { checkLicense } from '@/lib/license-check'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()

  if (!session?.user) {
    redirect('/login')
  }

  const { rol, companyId, branchId, id: userId } = session.user

  // SUPER_ADMIN no usa este layout
  if (rol === 'SUPER_ADMIN') {
    redirect('/sys-mnt-9x7k/panel')
  }

  // CLIENTE usa su propio layout
  if (rol === 'CLIENTE') {
    redirect('/mi-cuenta')
  }

  // Verificar licencia
  if (companyId) {
    const licenseResult = await checkLicense(companyId)
    if (!licenseResult.allowed) {
      redirect('/licencia-suspendida')
    }
  }

  // Obtener nombre de empresa y sucursal
  let companyName = ''
  let branchName = ''

  if (companyId) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { nombre: true },
    })
    companyName = company?.nombre ?? ''
  }

  if (branchId) {
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { nombre: true },
    })
    branchName = branch?.nombre ?? ''
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar — oculto en móvil por defecto, siempre visible en desktop */}
      <div className="hidden md:flex md:flex-shrink-0">
        <Sidebar
          userRole={rol}
          userName={session.user.name ?? ''}
          companyName={companyName}
          branchName={branchName}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      <Toaster />
    </div>
  )
}
