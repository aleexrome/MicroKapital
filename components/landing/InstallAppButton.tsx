'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Botón "Instalar app" en el landing.
 *
 * Flujo:
 *   - Android/Chrome/Edge/desktop → el navegador dispara
 *     `beforeinstallprompt` cuando cumple criterios (manifest + SW +
 *     visita suficiente). Capturamos el evento y al tocar el botón
 *     lanzamos el prompt nativo.
 *   - iOS Safari → no existe el evento. Mostramos modal con
 *     instrucción manual ("Compartir → Añadir a inicio").
 *   - Standalone (ya instalado) → ocultamos el botón.
 *
 * El SW se registra aquí mismo para no duplicar init en el layout.
 */

type DeferredPrompt = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallAppButton() {
  const [canInstall, setCanInstall] = useState(false)
  const [deferred, setDeferred] = useState<DeferredPrompt | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [showIOSHelp, setShowIOSHelp] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)

    // Detectar iOS Safari (iPad/iPhone/iPod — no incluimos Mac).
    const ua = window.navigator.userAgent
    const iOS = /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window)
    setIsIOS(iOS)

    // ¿Ya está instalado? Si corre standalone, no mostrar el botón.
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari expone `navigator.standalone` cuando corre desde home
      (window.navigator as { standalone?: boolean }).standalone === true
    setIsStandalone(standalone)

    // Registrar service worker — Chrome lo exige para considerar
    // installable. En iOS no hace daño; en standalone tampoco.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Si falla el register (p.ej. dev con HTTP) seguimos sin
        // romper el botón; solo no habrá prompt automático.
      })
    }

    function onPrompt(e: Event) {
      e.preventDefault()
      setDeferred(e as DeferredPrompt)
      setCanInstall(true)
    }
    function onInstalled() {
      setCanInstall(false)
      setDeferred(null)
      setIsStandalone(true)
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (isStandalone) return null

  async function handleClick() {
    if (deferred) {
      await deferred.prompt()
      const choice = await deferred.userChoice
      if (choice.outcome === 'accepted') {
        setCanInstall(false)
        setDeferred(null)
      }
      return
    }
    // Sin prompt disponible (iOS o Android que aún no cumplió el
    // umbral de visitas) → mostramos la guía manual.
    setShowIOSHelp(true)
  }

  // Si no es iOS y aún no tenemos prompt, no renderizamos el botón.
  // El prompt se habilita cuando Chrome lo dispara.
  if (!canInstall && !isIOS) return null

  return (
    <>
      <button
        onClick={handleClick}
        className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-white/10 backdrop-blur border border-white/30 text-white font-semibold hover:bg-white/20 transition"
        type="button"
      >
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
        Instalar app
      </button>

      {showIOSHelp && mounted && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowIOSHelp(false) }}
        >
          <div className="bg-white rounded-t-2xl sm:rounded-2xl max-w-md w-full p-6 space-y-4 text-gray-900">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold">Instalar MicroKapital</h3>
              <button onClick={() => setShowIOSHelp(false)} className="text-gray-400 hover:text-gray-700" aria-label="Cerrar">
                ✕
              </button>
            </div>
            {isIOS ? (
              <>
                <p className="text-sm text-gray-700">
                  En Safari toca el botón <strong>Compartir</strong> (<svg aria-hidden="true" className="inline" width="14" height="18" viewBox="0 0 14 18" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M7 1v12M3 5l4-4 4 4M2 10v6h10v-6"/></svg>) y después <strong>Añadir a pantalla de inicio</strong>.
                </p>
                <p className="text-xs text-gray-500">
                  Quedará como un ícono en tu pantalla principal, igual que cualquier otra app.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-700">
                  Abre esta página en Chrome o Edge. Si no te aparece el aviso automático de instalación, toca el menú (⋮) y elige <strong>Instalar app</strong> o <strong>Añadir a pantalla principal</strong>.
                </p>
                <p className="text-xs text-gray-500">
                  Si acabas de abrir el sitio por primera vez, es probable que el aviso aparezca en unos minutos.
                </p>
              </>
            )}
            <button
              onClick={() => setShowIOSHelp(false)}
              className="w-full py-2.5 rounded-full bg-pink-500 text-white font-semibold hover:bg-pink-600 transition"
            >
              Entendido
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
