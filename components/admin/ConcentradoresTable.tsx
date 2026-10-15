'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'

interface Row {
  branchId:     string
  branchNombre: string
  concentrador: { id: string; nombre: string; rol: string } | null
}

interface Candidato {
  id:     string
  nombre: string
  rol:    string
  branch: { nombre: string } | null
}

interface Props {
  rows:       Row[]
  candidatos: Candidato[]
}

const ROL_LABELS: Record<string, string> = {
  COORDINADOR:   'Coordinadora',
  COBRADOR:      'Cobrador',
  GERENTE:       'Gerente',
  GERENTE_ZONAL: 'Gerente Zonal',
  MESA_CONTROL:  'Mesa de Control',
}

export function ConcentradoresTable({ rows, candidatos }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [saving, setSaving]   = useState<string | null>(null)
  // State local: branchId -> concentradorUserId (null si "sin concentrador")
  const [draft, setDraft] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(rows.map((r) => [r.branchId, r.concentrador?.id ?? null])),
  )

  async function guardar(branchId: string) {
    const nuevoId = draft[branchId]
    setSaving(branchId)
    try {
      const res = await fetch(`/api/admin/branches/${branchId}/concentrador`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ concentradorUserId: nuevoId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Error al guardar')
      toast({ title: 'Concentrador actualizado' })
      router.refresh()
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Error',
        variant: 'destructive',
      })
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-600">
          <tr>
            <th className="text-left px-4 py-2">Sucursal</th>
            <th className="text-left px-4 py-2">Concentrador asignado</th>
            <th className="text-left px-4 py-2 w-80">Cambiar a</th>
            <th className="text-right px-4 py-2 w-32">Acción</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const current = draft[r.branchId]
            const dirty = current !== (r.concentrador?.id ?? null)
            return (
              <tr key={r.branchId} className="border-t border-gray-200">
                <td className="px-4 py-3 font-medium text-gray-900">{r.branchNombre}</td>
                <td className="px-4 py-3 text-gray-700">
                  {r.concentrador ? (
                    <span>
                      {r.concentrador.nombre}
                      <span className="text-xs text-gray-500 ml-1">({ROL_LABELS[r.concentrador.rol] ?? r.concentrador.rol})</span>
                    </span>
                  ) : (
                    <span className="text-amber-600 italic">sin asignar — directo a DG/DC</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={current ?? ''}
                    onChange={(e) => setDraft((prev) => ({ ...prev, [r.branchId]: e.target.value || null }))}
                    disabled={saving === r.branchId}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:border-fuchsia-500"
                  >
                    <option value="">— sin concentrador (directo a DG/DC) —</option>
                    {candidatos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} ({ROL_LABELS[c.rol] ?? c.rol}{c.branch?.nombre ? ` · ${c.branch.nombre}` : ''})
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant={dirty ? 'default' : 'outline'}
                    disabled={!dirty || saving === r.branchId}
                    onClick={() => guardar(r.branchId)}
                  >
                    {saving === r.branchId
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <><Save className="h-4 w-4" /> Guardar</>}
                  </Button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
