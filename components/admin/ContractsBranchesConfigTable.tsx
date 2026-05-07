'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/use-toast'
import { Loader2 } from 'lucide-react'

interface BranchConfigRow {
  branchId: string
  branchNombre: string
  codigoSucursal: string
  ciudad: string
  diaCobro: string
  horaLimiteCobro: string
  folioYear: number | null
  folioLastNumber: number | null
}

interface Props {
  rows: BranchConfigRow[]
}

const DIAS_OPTIONS: { value: string; label: string }[] = [
  { value: 'LUNES',     label: 'Lunes' },
  { value: 'MARTES',    label: 'Martes' },
  { value: 'MIERCOLES', label: 'Miércoles' },
  { value: 'JUEVES',    label: 'Jueves' },
  { value: 'VIERNES',   label: 'Viernes' },
  { value: 'SABADO',    label: 'Sábado' },
  { value: 'DOMINGO',   label: 'Domingo' },
]

const PLACEHOLDER_CODES = ['TEN', 'TOL', 'VER', 'MIN', 'MAR', 'SAN']

export function ContractsBranchesConfigTable({ rows: initialRows }: Props) {
  const [rows, setRows] = useState<BranchConfigRow[]>(initialRows)
  const [savingId, setSavingId] = useState<string | null>(null)
  const { toast } = useToast()

  function updateRow(branchId: string, patch: Partial<BranchConfigRow>) {
    setRows((prev) =>
      prev.map((r) => (r.branchId === branchId ? { ...r, ...patch } : r))
    )
  }

  async function handleSave(row: BranchConfigRow) {
    if (!row.codigoSucursal || !row.ciudad || !row.diaCobro || !row.horaLimiteCobro) {
      toast({
        title: 'Campos incompletos',
        description: 'Completa todos los campos antes de guardar',
        variant: 'destructive',
      })
      return
    }

    setSavingId(row.branchId)
    try {
      const res = await fetch(`/api/admin/contracts/branches-config/${row.branchId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigoSucursal: row.codigoSucursal.toUpperCase().trim(),
          ciudad: row.ciudad.trim(),
          diaCobro: row.diaCobro,
          horaLimiteCobro: row.horaLimiteCobro,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(typeof body.error === 'string' ? body.error : 'Error al guardar')
      }
      const body = await res.json()
      // Refleja el folio que devolvió el servidor (por si era la primera vez)
      updateRow(row.branchId, {
        codigoSucursal: body.data.codigoSucursal,
        folioYear: body.data.folioYear,
        folioLastNumber: body.data.folioLastNumber,
      })
      toast({ title: `${row.branchNombre} guardada` })
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Error',
        variant: 'destructive',
      })
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Sucursal</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Código</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Ciudad</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Día de cobro</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Hora límite</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Folio</th>
            <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Acción</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, idx) => {
            const placeholder = PLACEHOLDER_CODES[idx] ?? 'COD'
            const folioLabel =
              r.folioYear !== null && r.folioLastNumber !== null
                ? `${r.folioYear} · ${String(r.folioLastNumber).padStart(4, '0')}`
                : '—'
            return (
              <tr key={r.branchId} className="align-middle">
                <td className="px-4 py-3 font-medium whitespace-nowrap">{r.branchNombre}</td>

                <td className="px-2 py-3">
                  <Input
                    type="text"
                    value={r.codigoSucursal}
                    onChange={(e) =>
                      updateRow(r.branchId, {
                        codigoSucursal: e.target.value.toUpperCase(),
                      })
                    }
                    placeholder={placeholder}
                    maxLength={10}
                    className="h-9 w-24 uppercase"
                  />
                </td>

                <td className="px-2 py-3">
                  <Input
                    type="text"
                    value={r.ciudad}
                    onChange={(e) => updateRow(r.branchId, { ciudad: e.target.value })}
                    placeholder="Ciudad"
                    className="h-9 w-44"
                  />
                </td>

                <td className="px-2 py-3">
                  <select
                    value={r.diaCobro}
                    onChange={(e) => updateRow(r.branchId, { diaCobro: e.target.value })}
                    className="h-9 rounded-xl border border-border/60 bg-secondary/60 px-3 text-sm"
                  >
                    <option value="">— Seleccionar —</option>
                    {DIAS_OPTIONS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </td>

                <td className="px-2 py-3">
                  <Input
                    type="time"
                    value={r.horaLimiteCobro}
                    onChange={(e) => updateRow(r.branchId, { horaLimiteCobro: e.target.value })}
                    className="h-9 w-32"
                  />
                </td>

                <td className="px-4 py-3 text-muted-foreground tabular-nums whitespace-nowrap">
                  {folioLabel}
                </td>

                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    onClick={() => handleSave(r)}
                    disabled={savingId === r.branchId}
                  >
                    {savingId === r.branchId && <Loader2 className="h-3 w-3 animate-spin" />}
                    Guardar
                  </Button>
                </td>
              </tr>
            )
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="text-center py-8 text-muted-foreground">
                No hay sucursales activas
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
