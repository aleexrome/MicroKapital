'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Users, Pencil, X } from 'lucide-react'

interface EditarAvalDialogProps {
  loanId: string
  initialNombre:      string | null
  initialTelefono:    string | null
  initialTelefonoAlt: string | null
  initialDireccion:   string | null
  initialRelacion:    string | null
  /** Si false, el boton dice "Agregar aval" en vez de "Editar aval". */
  tieneAval: boolean
}

/**
 * Boton + dialogo para capturar/editar los datos del aval del prestamo.
 * Muchos creditos viejos o renovados quedaron sin aval registrado, asi
 * que aqui entra todo: nombre (primero, para saber de quien es el
 * numero), direccion, telefono, telefono alterno y relacion.
 *
 * Cualquier rol autenticado puede llamarlo.
 */
export function EditarAvalDialog({
  loanId,
  initialNombre,
  initialTelefono,
  initialTelefonoAlt,
  initialDireccion,
  initialRelacion,
  tieneAval,
}: EditarAvalDialogProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [nombre,      setNombre]      = useState(initialNombre      ?? '')
  const [telefono,    setTelefono]    = useState(initialTelefono    ?? '')
  const [telefonoAlt, setTelefonoAlt] = useState(initialTelefonoAlt ?? '')
  const [direccion,   setDireccion]   = useState(initialDireccion   ?? '')
  const [relacion,    setRelacion]    = useState(initialRelacion    ?? '')

  function close() {
    if (loading) return
    setOpen(false)
    setNombre(initialNombre           ?? '')
    setTelefono(initialTelefono       ?? '')
    setTelefonoAlt(initialTelefonoAlt ?? '')
    setDireccion(initialDireccion     ?? '')
    setRelacion(initialRelacion       ?? '')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch(`/api/loans/${loanId}/aval`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avalNombre:      nombre.trim()      || null,
          avalTelefono:    telefono.trim()    || null,
          avalTelefonoAlt: telefonoAlt.trim() || null,
          avalDireccion:   direccion.trim()   || null,
          avalRelacion:    relacion.trim()    || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Error al guardar')
      }
      toast({
        title: 'Aval actualizado',
        description: 'Los nuevos datos del aval quedaron registrados.',
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
        title={tieneAval ? 'Editar aval' : 'Agregar aval'}
        onClick={() => setOpen(true)}
      >
        <Pencil className="h-3.5 w-3.5 mr-1" />
        {tieneAval ? 'Editar aval' : 'Agregar aval'}
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
                <Users className="h-5 w-5 text-primary-500" />
                <h3 className="text-base font-semibold">Datos del aval</h3>
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
                <Label htmlFor="avalNombre">Nombre completo del aval</Label>
                <Input
                  id="avalNombre"
                  autoFocus
                  placeholder="Ej: MARIA LOPEZ"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="avalDireccion">Direccion del aval</Label>
                <Input
                  id="avalDireccion"
                  placeholder="Calle, numero, colonia, municipio"
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="avalTelefono">Telefono del aval</Label>
                <Input
                  id="avalTelefono"
                  type="tel"
                  inputMode="tel"
                  placeholder="Ej: 7225634881"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="avalTelefonoAlt">Telefono alterno del aval</Label>
                <Input
                  id="avalTelefonoAlt"
                  type="tel"
                  inputMode="tel"
                  placeholder="Otro numero del aval (opcional)"
                  value={telefonoAlt}
                  onChange={(e) => setTelefonoAlt(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="avalRelacion">Relacion con el cliente</Label>
                <select
                  id="avalRelacion"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
                  value={relacion}
                  onChange={(e) => setRelacion(e.target.value)}
                  disabled={loading}
                >
                  <option value="">Selecciona</option>
                  <option value="CONYUGE">Conyuge</option>
                  <option value="FAMILIAR">Familiar directo</option>
                  <option value="CONOCIDO">Conocido / Amigo</option>
                </select>
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
