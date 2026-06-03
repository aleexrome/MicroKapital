'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Trash2, X, AlertTriangle } from 'lucide-react'

interface Props {
  empleadoId: string
  empleadoNombre: string
}

export function EliminarEmpleadoButton({ empleadoId, empleadoNombre }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    try {
      const res = await fetch(`/api/empleados/${empleadoId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Error al eliminar')
      }
      toast({ title: 'Empleado eliminado' })
      setOpen(false)
      router.refresh()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'No se pudo eliminar',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-destructive hover:text-destructive"
        title="Eliminar empleado"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !loading && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-card border border-border/60 shadow-card p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <h3 className="text-base font-semibold">Eliminar empleado</h3>
              </div>
              <button
                type="button"
                onClick={() => !loading && setOpen(false)}
                disabled={loading}
                className="text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground">
              Se borrará la ficha de <strong className="text-foreground">{empleadoNombre}</strong> de Recursos Humanos.
              Esto no afecta su cuenta de la app (si la tiene). La acción no es reversible.
            </p>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="flex-1"
                onClick={handleConfirm}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
