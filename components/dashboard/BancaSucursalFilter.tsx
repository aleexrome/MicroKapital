'use client'

import { useRouter, useSearchParams } from 'next/navigation'

interface BranchOption {
  id: string
  nombre: string
}

interface BancaSucursalFilterProps {
  branches: BranchOption[]
  selected: string
}

export function BancaSucursalFilter({ branches, selected }: BancaSucursalFilterProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'ALL') {
      params.delete('sucursal')
    } else {
      params.set('sucursal', value)
    }
    const qs = params.toString()
    router.push(qs ? `/banca?${qs}` : '/banca')
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="banca-sucursal" className="text-sm font-medium text-muted-foreground">
        Sucursal:
      </label>
      <select
        id="banca-sucursal"
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
      >
        <option value="ALL">Todas las sucursales</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.nombre}
          </option>
        ))}
      </select>
    </div>
  )
}
