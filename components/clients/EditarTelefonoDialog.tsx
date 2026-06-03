'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Phone, Pencil, X } from 'lucide-react'

interface EditarTelefonoDialogProps {
  clientId: string
  initialTelefono: string | null
  initialTelefonoAlt: string | null
}

/**
 * Boton + dialogo para que cualquier rol pueda capturar/corregir los
 * telefonos del cliente. Este dato alimenta el sistema de recordatorios
 * automaticos por voz que se construira despues, por eso interesa que
 * cualquiera en campo pueda corregir un numero malo sin esperar a DG.
 *
 * El resto del expediente (nombre, INE, etc.) sigue siendo dominio
 * exclusivo del DG -- esto solo abre la ventana de los dos telefonos.
 */
export function EditarTelefonoDialog({
  clientId,
  initialTelefono,
  initialTelefonoAlt,
}: EditarTelefonoDialogProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [telefono, setTelefono] = useState(initialTelefono ?? '')
  const [telefonoAlt, setTelefonoAlt] = useState(initialTelefonoAlt ?? '')

  const tieneAlgo = !!initialTelefono || !!initialTelefonoAlt

  function close() {
    if (loading) return
    setOpen(false)
    // Restaurar valores iniciales si el usuario cierra sin guardar.
    setTelefono(initialTelefono ?? '')
    setTelefonoAlt(initialTelefonoAlt ?? '')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telefono:    telefono.trim()    || null,
          telefonoAlt: telefonoAlt.trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Error al guardar')
      }
      toast({
        title: 'Telefonos actualizados',
        description: 'Los nuevos datos quedaron registrados.',
      })
      setOpen(false)
      router.refresh()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'No se pudo guardar',
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
        className="h-7 px-2 text-xs"
        title={tieneAlgo ? 'Editar telefono' : 'Agregar telefono'}
        onClick={() => setOpen(true)}
      >
        <Pencil className="h-3.5 w-3.5 mr-1" />
        {tieneAlgo ? 'Editar' : 'Agregar telefono'}
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={close}
        >
          <form
            className="w-full max-w-md rounded-2xl bg-card border border-border/60 shadow-card p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmit}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Phone className="h-5 w-5 text-primary-500" />
                <h3 className="text-base font-semibold">Telefonos del cliente</h3>
              </div>
              <button
                type="button"
                onClick={close}
                disabled={loading}
                className="text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="telefono">Telefono principal</Label>
                <Input
                  id="telefono"
                  type="tel"
                  inputMode="tel"
                  autoFocus
                  placeholder="Ej: 7225634881"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="telefonoAlt">Telefono alterno (opcional)</Label>
                <Input
                  id="telefonoAlt"
                  type="tel"
                  inputMode="tel"
                  placeholder="Ej: 7227890123"
                  value={telefonoAlt}
                  onChange={(e) => setTelefonoAlt(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={close}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Guardar
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
