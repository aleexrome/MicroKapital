'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Pause, Play } from 'lucide-react'

interface Props {
  /** Intervalo en milisegundos. Default 60s. */
  intervalMs?: number
}

/**
 * Refresca la página actual cada `intervalMs` llamando a router.refresh().
 * Permite pausar/reanudar y muestra cuándo fue el último refresh.
 *
 * Pensado para `/reportes/cumplimiento` y demás dashboards en tiempo real.
 *
 * Importante: el componente NO usa `new Date()` durante el render inicial
 * porque el server renderiza una hora y el cliente otra → hydration
 * mismatch (errores React #418/#423/#425). El timestamp aparece después
 * de montar, vía useEffect.
 */
export function AutoRefresh({ intervalMs = 60_000 }: Props) {
  const router = useRouter()
  const [paused, setPaused] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(Math.floor(intervalMs / 1000))

  // Set initial timestamp solo en cliente, después de montar
  useEffect(() => {
    setLastRefresh(new Date())
  }, [])

  useEffect(() => {
    if (paused) return
    const tick = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          router.refresh()
          setLastRefresh(new Date())
          return Math.floor(intervalMs / 1000)
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(tick)
  }, [paused, intervalMs, router])

  function handleManualRefresh() {
    router.refresh()
    setLastRefresh(new Date())
    setSecondsLeft(Math.floor(intervalMs / 1000))
  }

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="font-mono">
        {paused ? 'En pausa' : `Refresca en ${secondsLeft}s`}
      </span>
      <button
        type="button"
        onClick={handleManualRefresh}
        title="Refrescar ahora"
        className="rounded-lg p-1.5 hover:bg-secondary transition-colors text-foreground"
      >
        <RefreshCw className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        title={paused ? 'Reanudar' : 'Pausar'}
        className="rounded-lg p-1.5 hover:bg-secondary transition-colors text-foreground"
      >
        {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
      </button>
      <span className="font-mono opacity-60">
        Última: {lastRefresh
          ? lastRefresh.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          : '—'}
      </span>
    </div>
  )
}
