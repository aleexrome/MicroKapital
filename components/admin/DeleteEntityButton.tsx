'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'

/**
 * Botón con modal de confirmación para soft-delete (cliente o grupo).
 * Solo se renderiza si el caller decidió que debe verse — la página
 * pasante valida `rol === 'DIRECTOR_GENERAL'` antes de incluirlo.
 *
 * Llama `DELETE {endpoint}`; al éxito refresca la ruta para que la
 * fila desaparezca de la lista. El registro queda con `eliminadoEn`
 * y se purga a los 14 días vía cron.
 */
export function DeleteEntityButton({
  endpoint,
  entityName,
  entityKind,
}: {
  endpoint: string
  entityName: string
  entityKind: 'cliente' | 'grupo'
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(endpoint, { method: 'DELETE' })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          setError(body?.error ?? `Error ${res.status}`)
          return
        }
        setOpen(false)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error desconocido')
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          // No queremos que el click navegue al detalle si el botón vive
          // dentro de una <Link> de la fila.
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }}
        className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
        aria-label={`Eliminar ${entityKind}`}
        title={`Eliminar ${entityKind}`}
      >
        <Trash2 className="h-4 w-4" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isPending) setOpen(false)
          }}
        >
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">
              ¿Eliminar {entityKind}?
            </h2>
            <p className="text-sm text-gray-600">
              Vas a eliminar a <strong>{entityName}</strong>. Sus datos quedan
              congelados (no aparece en cartera, agenda, rutas ni dashboard) pero
              se conservan 14 días por si fue accidente. Pasado ese plazo se
              borran de forma definitiva.
            </p>
            {error && (
              <div className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">
                {error}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-sm rounded-md border border-input bg-background hover:bg-secondary disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleConfirm}
                className="px-4 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 inline-flex items-center gap-2"
              >
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
