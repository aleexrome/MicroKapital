'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2, AlertTriangle } from 'lucide-react'

type LoanCounts = { activos: number; pendientes: number; regresados: number }

/**
 * Botón con modal de confirmación para soft-delete (cliente o grupo).
 * Solo se renderiza si el caller decidió que debe verse — la página
 * pasante valida `rol === 'DIRECTOR_GENERAL'` antes de incluirlo.
 *
 * Llama `DELETE {endpoint}`; al éxito refresca la ruta para que la
 * fila desaparezca de la lista. El registro queda con `eliminadoEn`
 * y se purga a los 14 días vía cron.
 *
 * Guardrail contra el incidente Paula/Karen: si el servidor responde
 * 409 con `requiresConfirm`, cambiamos el modal a modo alarma con el
 * conteo de préstamos vigentes y pedimos una segunda confirmación
 * antes de reintentar con `?force=true`.
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
  const [warning, setWarning] = useState<{ mensaje: string; loans: LoanCounts } | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function resetState() {
    setError(null)
    setWarning(null)
  }

  function doDelete(force: boolean) {
    setError(null)
    startTransition(async () => {
      try {
        const url = force ? `${endpoint}?force=true` : endpoint
        const res = await fetch(url, { method: 'DELETE' })
        if (res.status === 409) {
          const body = await res.json().catch(() => null)
          if (body?.requiresConfirm && body?.loans) {
            setWarning({
              mensaje: body.error ?? 'Este registro tiene préstamos en vuelo.',
              loans: body.loans as LoanCounts,
            })
            return
          }
          setError(body?.error ?? `Error ${res.status}`)
          return
        }
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          setError(body?.error ?? `Error ${res.status}`)
          return
        }
        setOpen(false)
        resetState()
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
          resetState()
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
            if (e.target === e.currentTarget && !isPending) {
              setOpen(false)
              resetState()
            }
          }}
        >
          <div
            className={`bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4 ${
              warning ? 'ring-2 ring-red-500' : ''
            }`}
          >
            {warning ? (
              <>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-red-700">
                      Este {entityKind} tiene créditos en vuelo
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">{entityName}</p>
                  </div>
                </div>

                <div className="rounded-md bg-red-50 border border-red-200 p-3 space-y-2">
                  <p className="text-sm text-red-900 font-medium">Perderás:</p>
                  <ul className="text-sm text-red-800 space-y-1 pl-4 list-disc">
                    {warning.loans.activos > 0 && (
                      <li>
                        <strong>{warning.loans.activos}</strong> crédito{warning.loans.activos === 1 ? '' : 's'} <strong>ACTIVO{warning.loans.activos === 1 ? '' : 'S'}</strong> (con cobranza en curso)
                      </li>
                    )}
                    {warning.loans.pendientes > 0 && (
                      <li>
                        <strong>{warning.loans.pendientes}</strong> pendiente{warning.loans.pendientes === 1 ? '' : 's'} en Mesa de Control
                      </li>
                    )}
                    {warning.loans.regresados > 0 && (
                      <li>
                        <strong>{warning.loans.regresados}</strong> regresado{warning.loans.regresados === 1 ? '' : 's'} al coordinador
                      </li>
                    )}
                  </ul>
                  <p className="text-xs text-red-700 pt-1">
                    Esos créditos quedarán huérfanos: dejarán de aparecer en cobranza,
                    agenda y rutas, y el coordinador no podrá volver a capturarlos.
                  </p>
                </div>

                <p className="text-sm text-gray-700">
                  Si el {entityKind} está duplicado o de plano quieres borrarlo, primero
                  reasigna sus créditos a otro {entityKind}. ¿Aún así quieres eliminarlo?
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
                    onClick={() => {
                      setOpen(false)
                      resetState()
                    }}
                    className="px-4 py-2 text-sm rounded-md border border-input bg-background hover:bg-secondary disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => doDelete(true)}
                    className="px-4 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 inline-flex items-center gap-2"
                  >
                    {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Eliminar de todos modos
                  </button>
                </div>
              </>
            ) : (
              <>
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
                    onClick={() => {
                      setOpen(false)
                      resetState()
                    }}
                    className="px-4 py-2 text-sm rounded-md border border-input bg-background hover:bg-secondary disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => doDelete(false)}
                    className="px-4 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 inline-flex items-center gap-2"
                  >
                    {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Sí, eliminar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
