import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { getRankingCoordinadores } from '@/lib/reportes/rankingCoordinadores'
import { RankingCoordinadoresView } from '@/components/reportes/RankingCoordinadoresView'

// Caché por hora a nivel de página; el lib cachea el cómputo pesado
// scoped por (companyId, semanas).
export const revalidate = 3600

const PERMITIDOS = ['SUPER_ADMIN', 'DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'MESA_CONTROL', 'GERENTE_ZONAL']

// Opciones válidas de periodo (semanas atrás a mostrar). Valores que
// no estén aquí caen al default. Mantener el set pequeño ayuda a que
// el cache se reuse — cada N distinto es un entry nuevo.
const SEMANAS_VALIDAS = new Set([1, 4, 8, 12])
const SEMANAS_DEFAULT = 8

export default async function RankingCoordinadoresPage({
  searchParams,
}: {
  searchParams?: { semanas?: string }
}) {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  if (!PERMITIDOS.includes(session.user.rol)) redirect('/reportes')
  if (!session.user.companyId) redirect('/dashboard')

  const semanasParam = Number(searchParams?.semanas)
  const semanas = SEMANAS_VALIDAS.has(semanasParam) ? semanasParam : SEMANAS_DEFAULT

  const data = await getRankingCoordinadores(session.user.companyId, semanas)
  return <RankingCoordinadoresView data={data} semanasActual={semanas} />
}
