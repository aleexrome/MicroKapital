import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { ReajusteAgilClient } from './ReajusteAgilClient'

export const dynamic = 'force-dynamic'

/**
 * Herramienta one-shot para DG / SUPER_ADMIN: reajustar los calendarios
 * de créditos Ágil vigentes que se generaron mientras el 16-sep estaba
 * marcado como inhábil. Corre un preview primero (dry-run) y muestra
 * cuántos créditos y cuántos schedules se van a mover; si todo cuadra,
 * el botón Aplicar hace el update real.
 *
 * Esta página se puede borrar después de correr el ajuste — no es
 * parte de la operación normal, es una utilidad correctiva.
 */
export default async function ReajustarAgilSep16Page() {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  const { rol } = session.user
  if (rol !== 'DIRECTOR_GENERAL' && rol !== 'SUPER_ADMIN') {
    redirect('/dashboard')
  }
  return <ReajusteAgilClient />
}
