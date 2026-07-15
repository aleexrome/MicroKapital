'use client'

import { useRouter } from 'next/navigation'
import { Users } from 'lucide-react'

/**
 * Chip clickable con el nombre del grupo del préstamo. Se usa dentro
 * de tarjetas cuyo contenedor ya es un <Link> — por eso navega vía
 * router.push + stopPropagation en vez de anidar otro <Link>/<a>
 * (HTML inválido, causa warnings de hidratación).
 */
export function LoanGroupChip({ groupId, name }: { groupId: string; name: string }) {
  const router = useRouter()

  function go(e: React.SyntheticEvent) {
    e.stopPropagation()
    e.preventDefault()
    router.push(`/grupos/${groupId}`)
  }

  return (
    <span
      role="link"
      tabIndex={0}
      onClick={go}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') go(e) }}
      title={`Ver grupo ${name} en cartera`}
      className="inline-flex items-center gap-1 rounded-md border border-violet-400/40 bg-violet-500/10 px-1.5 py-0.5 text-xs font-medium text-violet-300 hover:bg-violet-500/20 hover:text-violet-200 cursor-pointer transition-colors"
    >
      <Users className="h-3 w-3" />
      {name}
    </span>
  )
}
