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
    if (!row.codigoSucursal || !row.ciudad) {
      toast({
        title: 'Campos incompletos',
        description: 'Código y ciudad son requeridos',
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
      <div className="px-4 py-2 text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded-lg mb-3">
        <strong>Nota:</strong> el día y la hora límite de cobro ya no se configuran por sucursal —
        Dirección General los define al aprobar cada préstamo y se plasman en el contrato.
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Sucursal</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Código</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Ciudad</th>
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
              <td colSpan={5} className="text-center py-8 text-muted-foreground">
                No hay sucursales activas
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
