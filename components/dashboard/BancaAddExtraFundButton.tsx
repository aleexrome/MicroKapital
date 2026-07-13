'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Plus, Loader2, X } from 'lucide-react'

interface BranchOption {
  id: string
  nombre: string
}

interface Props {
  branches: BranchOption[]
  /** Sucursal preseleccionada si viene el filtro `?sucursal=`. */
  defaultBranchId?: string
}

/**
 * Botón "+ Agregar monto adicional" que abre un modal para capturar un
 * aporte de tesorería (Dirección envía $X extra a una sucursal en tal
 * fecha). POST a /api/banca/adicional y refresh de la vista.
 */
export function BancaAddExtraFundButton({ branches, defaultBranchId }: Props) {
  const router = useRouter()
  const { toast } = useToast()

  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [branchId, setBranchId] = useState(defaultBranchId ?? branches[0]?.id ?? '')
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [monto, setMonto] = useState('')
  const [concepto, setConcepto] = useState('')

  function reset() {
    setBranchId(defaultBranchId ?? branches[0]?.id ?? '')
    setFecha(new Date().toISOString().slice(0, 10))
    setMonto('')
    setConcepto('')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const montoNum = Number(monto)
    if (!branchId) {
      toast({ title: 'Falta la sucursal', variant: 'destructive' })
      return
    }
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      toast({ title: 'Monto inválido', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/banca/adicional', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId,
          fecha,
          monto: montoNum,
          concepto: concepto.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const msg = typeof err.message === 'string' ? err.message
          : typeof err.error === 'string' ? err.error
          : 'No se pudo registrar el aporte'
        throw new Error(msg)
      }
      toast({ title: 'Aporte registrado', description: `Se sumó al neto de la semana correspondiente.` })
      setOpen(false)
      reset()
      router.refresh()
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Error al registrar',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-violet-600 hover:bg-violet-700 text-white"
      >
        <Plus className="h-4 w-4" />
        Agregar monto adicional
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !saving && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Registrar aporte adicional</h2>
                <p className="text-xs text-muted-foreground">
                  Se suma al total de cortes de la semana correspondiente.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !saving && setOpen(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Sucursal</label>
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  required
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.nombre}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Fecha</label>
                <input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Monto (MXN)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder="50000"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Concepto (opcional)</label>
                <input
                  type="text"
                  value={concepto}
                  onChange={(e) => setConcepto(e.target.value)}
                  placeholder='Ej: "Envío para dispersar créditos ágiles"'
                  maxLength={200}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => !saving && setOpen(false)}
                  disabled={saving}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving} className="bg-violet-600 hover:bg-violet-700 text-white">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Registrar'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
