'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/use-toast'

/**
 * Botón con ícono de lápiz para editar el nombre de un grupo solidario.
 * Solo se renderiza cuando se le pasa `canEdit={true}` — la página padre
 * decide en base al rol (DG/DC/SA).
 *
 * Click → modal pequeño con input → Guardar llama a PATCH /api/loan-groups/[id]
 * → router.refresh() para reflejar el cambio en la lista/detalle.
 */
interface Props {
  groupId: string
  currentName: string
  /** Tamaño del icono (px). Default 14. */
  iconSize?: number
}

export function EditGroupNameButton({ groupId, currentName, iconSize = 14 }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [nombre, setNombre] = useState(currentName)
  const [saving, setSaving] = useState(false)

  function handleOpen(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setNombre(currentName)
    setOpen(true)
  }

  function handleClose() {
    if (saving) return
    setOpen(false)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const limpio = nombre.trim()
    if (!limpio) {
      toast({ title: 'El nombre no puede estar vacío', variant: 'destructive' })
      return
    }
    if (limpio.toUpperCase() === currentName.toUpperCase()) {
      setOpen(false)
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/loan-groups/${groupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: limpio }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'No se pudo actualizar')
      }
      toast({ title: 'Nombre actualizado' })
      setOpen(false)
      router.refresh()
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'No se pudo actualizar',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        title="Editar nombre del grupo"
        className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
      >
        <Pencil style={{ width: iconSize, height: iconSize }} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={handleClose}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSave}
            className="w-full max-w-sm rounded-2xl bg-card border border-border/60 shadow-xl"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
              <h2 className="text-base font-semibold">Editar nombre del grupo</h2>
              <button
                type="button"
                onClick={handleClose}
                disabled={saving}
                className="rounded-md p-1 hover:bg-secondary text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <p className="text-xs text-muted-foreground">
                Nombre actual: <span className="font-mono">{currentName}</span>
              </p>
              <Input
                value={nombre}
                onChange={(e) => setNombre(e.target.value.toUpperCase())}
                style={{ textTransform: 'uppercase' }}
                placeholder="Ej: GRUPO LAS FLORES"
                autoFocus
                maxLength={120}
                disabled={saving}
              />
              <p className="text-[10px] text-muted-foreground">
                Se guarda automáticamente en MAYÚSCULAS, igual que cuando se crea el grupo.
              </p>
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-border/60">
              <Button type="button" variant="ghost" onClick={handleClose} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving || !nombre.trim()}>
                {saving
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Guardando...</>
                  : 'Guardar'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
