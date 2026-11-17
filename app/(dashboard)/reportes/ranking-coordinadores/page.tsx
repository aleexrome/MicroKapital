import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { getRankingCoordinadores } from '@/lib/reportes/rankingCoordinadores'
import { RankingCoordinadoresView } from '@/components/reportes/RankingCoordinadoresView'

// Caché 24h — el dato lo trae unstable_cache del lib, no necesita
// force-dynamic. ISR al nivel de página también funcionaría pero el
// cache del lib ya es scoped por companyId, mejor.
export const revalidate = 3600  // Next revalida la página cada hora;
                                 // el lib cachea el cómputo pesado 24h.

const PERMITIDOS = ['SUPER_ADMIN', 'DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'MESA_CONTROL', 'GERENTE_ZONAL']

export default async function RankingCoordinadoresPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  if (!PERMITIDOS.includes(session.user.rol)) redirect('/reportes')
  if (!session.user.companyId) redirect('/dashboard')

  const data = await getRankingCoordinadores(session.user.companyId, 8)
  return <RankingCoordinadoresView data={data} />
}
