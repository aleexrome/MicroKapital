export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { getCobranzaTiempoReal } from '@/lib/reportes/tiempoReal'
import { TiempoRealView } from '@/components/reportes/TiempoRealView'

const PERMITIDOS = ['SUPER_ADMIN', 'DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'MESA_CONTROL', 'GERENTE_ZONAL']

export default async function TiempoRealPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  if (!PERMITIDOS.includes(session.user.rol)) redirect('/reportes')
  if (!session.user.companyId) redirect('/dashboard')

  const data = await getCobranzaTiempoReal(session.user.companyId)
  return <TiempoRealView initialData={data} />
}
