'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'

interface Branch { id: string; nombre: string }

export function BranchFilter({
  branches,
  selected,
}: {
  branches: Branch[]
  selected: string | null
}) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString())
    if (e.target.value) {
      params.set('sucursal', e.target.value)
    } else {
      params.delete('sucursal')
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <select
      value={selected ?? ''}
      onChange={onChange}
      className="h-8 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <option value="">Todas las sucursales</option>
      {branches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.nombre}
        </option>
      ))}
    </select>
  )
}
