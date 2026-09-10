'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/use-toast'
import { Loader2 } from 'lucide-react'

interface Props {
  userId: string
  nombre: string
  activo: boolean
  /** Si es el propio director viendo la pagina, no se puede kickear a
   *  si mismo — pintamos un dash en lugar del switch. */
  disabled?: boolean
}

/**
 * Switch de acceso (habilita/deshabilita credenciales de app). Al
 * apagarlo:
 *   - En la proxima navegacion o llamada al API, getSession() ve
 *     activo=false y la sesion queda invalidada -> redirect a /login.
 *   - Aunque el usuario tenga la pagina abierta, cualquier accion (dar
 *     click en algo que llama al backend) lo saca al instante.
 */
export function AccesoSwitch({ userId, nombre, activo, disabled }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [pending, setPending] = useState(false)
  // Optimistic UI: pintamos el switch en la posicion nueva mientras el
  // PATCH viaja. Si el server rechaza, revertimos.
  const [checked, setChecked] = useState(activo)

  if (disabled) {
    return <span className="text-xs text-muted-foreground italic">Tú</span>
  }

  async function toggle() {
    if (pending) return
    const next = !checked
    // Confirmacion humana antes de deshabilitar — es una accion que
    // saca a alguien del sistema en cuanto haga la proxima llamada.
    if (!next && !confirm(`¿Deshabilitar el acceso de ${nombre}? Se quedará fuera en cuanto haga cualquier acción.`)) {
      return
    }
    setPending(true)
    setChecked(next)
    try {
      const res = await fetch(`/api/users/${userId}/access`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: next }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'No se pudo actualizar el acceso')
      }
      toast({
        title: next ? '✅ Acceso habilitado' : '🔒 Acceso deshabilitado',
        description: next
          ? `${nombre} puede volver a iniciar sesión.`
          : `${nombre} saldrá del sistema en la próxima acción.`,
      })
      // Refresca el server component para que la fila muestre el estado
      // real (ya sin el flicker del optimistic).
      router.refresh()
    } catch (err) {
      setChecked(!next)
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`Acceso de ${nombre}`}
      onClick={toggle}
      disabled={pending}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 disabled:opacity-60 ${
        checked ? 'bg-emerald-500' : 'bg-gray-300'
      }`}
      title={checked ? 'Acceso habilitado — click para deshabilitar' : 'Acceso deshabilitado — click para habilitar'}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
      {pending && (
        <Loader2 className="absolute inset-0 m-auto h-3 w-3 animate-spin text-white" />
      )}
    </button>
  )
}
