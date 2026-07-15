'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Minus, Loader2, X } from 'lucide-react'

interface BranchOption {
  id: string
  nombre: string
}

interface Props {
  branches: BranchOption[]
  defaultBranchId?: string
}

/**
 * Botón "Registrar retiro" — espejo negativo del aporte adicional.
 * Modal con sucursal / fecha / monto / concepto. Solo DG/DC/SA.
 */
export function BancaAddWithdrawalButton({ branches, defaultBranchId }: Props) {
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
      const res = await fetch('/api/banca/retiro', {
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
          : 'No se pudo registrar el retiro'
        throw new Error(msg)
      }
      toast({ title: 'Retiro registrado', description: 'Se restó del neto de la semana correspondiente.' })
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
        className="bg-rose-600 hover:bg-rose-700 text-white"
      >
        <Minus className="h-4 w-4" />
        Registrar retiro
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
                <h2 className="text-lg font-semibold text-foreground">Registrar retiro de recurso</h2>
                <p className="text-xs text-muted-foreground">
                  Se resta del neto bancable de la semana correspondiente.
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
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Monto retirado (MXN)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder="30000"
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
                  placeholder='Ej: "Retiro para gastos operativos"'
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
                <Button type="submit" disabled={saving} className="bg-rose-600 hover:bg-rose-700 text-white">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Registrar retiro'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
