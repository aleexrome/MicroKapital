'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, BellRing, AlertTriangle, X, Check, ExternalLink } from 'lucide-react'
import Link from 'next/link'

interface Notif {
  id: string
  tipo: string
  titulo: string
  mensaje: string
  esCritica: boolean
  leidaAt: string | null
  expiraAt: string | null
  createdAt: string
  loanId: string | null
  clientId: string | null
}

interface FetchResponse {
  items: Notif[]
  nextCursor: string | null
  noLeidasCount: number
  criticasCount: number
}

function tiempoRelativo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.round(ms / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const hr = Math.round(min / 60)
  if (hr < 24) return `hace ${hr} h`
  const dia = Math.round(hr / 24)
  return `hace ${dia} d`
}

interface Props {
  /** Callback cuando se detecta una crítica activa, para que el cluster
   *  se auto-expanda la primera vez que se carga. */
  onCriticaDetected?: (count: number) => void
  /** Callback con conteo de no-leídas para que el cluster muestre badge
   *  en el master button cuando está colapsado. */
  onCountChange?: (noLeidasCount: number, criticasCount: number) => void
}

export function CampanaNotificaciones({ onCriticaDetected, onCountChange }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notif[]>([])
  const [noLeidasCount, setNoLeidasCount] = useState(0)
  const [criticasCount, setCriticasCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [marking, setMarking] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const criticaCallbackFired = useRef(false)

  async function fetchData() {
    setLoading(true)
    try {
      const res = await fetch('/api/notifications?limit=5')
      if (!res.ok) return
      const data = (await res.json()) as FetchResponse
      setItems(data.items)
      setNoLeidasCount(data.noLeidasCount)
      setCriticasCount(data.criticasCount)
      onCountChange?.(data.noLeidasCount, data.criticasCount)
      if (data.criticasCount > 0 && !criticaCallbackFired.current) {
        criticaCallbackFired.current = true
        onCriticaDetected?.(data.criticasCount)
      }
    } finally {
      setLoading(false)
    }
  }

  // Carga inicial + polling cada 60s
  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 60_000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Refrescar al abrir
  useEffect(() => {
    if (open) fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Click fuera = cerrar
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (open && dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  async function marcarLeida(notif: Notif) {
    if (notif.esCritica) {
      // Solo navega, no marca
      if (notif.loanId) router.push(`/prestamos/${notif.loanId}`)
      setOpen(false)
      return
    }
    try {
      await fetch(`/api/notifications/${notif.id}/read`, { method: 'POST' })
      setItems((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, leidaAt: new Date().toISOString() } : n))
      )
      setNoLeidasCount((c) => Math.max(0, c - 1))
    } catch {
      // ignorar
    }
    if (notif.loanId) router.push(`/prestamos/${notif.loanId}`)
    setOpen(false)
  }

  async function marcarTodasLeidas() {
    setMarking(true)
    try {
      await fetch('/api/notifications/mark-all-read', { method: 'POST' })
      // Refrescar
      await fetchData()
    } finally {
      setMarking(false)
    }
  }

  const hasUnread = noLeidasCount > 0
  const hasCritical = criticasCount > 0

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`relative flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-all hover:scale-105 ${
          hasCritical
            ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse'
            : hasUnread
              ? 'bg-amber-500 hover:bg-amber-400 text-white'
              : 'bg-primary-500 hover:bg-primary-400 text-white'
        }`}
        style={{
          boxShadow: hasCritical
            ? '0 4px 24px rgba(220,38,38,0.7)'
            : hasUnread
              ? '0 4px 20px rgba(245,158,11,0.5)'
              : '0 4px 20px rgba(123,111,255,0.55)',
        }}
        aria-label={`Notificaciones${hasUnread ? ` (${noLeidasCount} no leídas)` : ''}`}
      >
        {hasCritical ? <BellRing className="h-6 w-6" /> : <Bell className="h-6 w-6" />}
        {hasUnread && (
          <span className="absolute -top-1 -right-1 min-w-[22px] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center border-2 border-background">
            {noLeidasCount > 99 ? '99+' : noLeidasCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute bottom-16 right-0 w-[360px] max-w-[calc(100vw-2rem)] max-h-[520px] flex flex-col rounded-2xl shadow-2xl overflow-hidden bg-card border border-border z-[60]"
          style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/80 backdrop-blur shrink-0">
            <h3 className="font-semibold text-sm">Notificaciones</h3>
            <button
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-border/50">
            {loading && items.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">Cargando…</div>
            ) : items.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">Sin notificaciones</div>
            ) : (
              items.map((n) => {
                const isUnread = n.leidaAt === null
                return (
                  <button
                    key={n.id}
                    onClick={() => marcarLeida(n)}
                    className={`w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors flex gap-3 ${
                      isUnread && !n.esCritica ? 'bg-amber-50/30 dark:bg-amber-500/5' : ''
                    } ${n.esCritica ? 'bg-red-50/40 dark:bg-red-500/10' : ''}`}
                  >
                    <div className="shrink-0 mt-0.5">
                      {n.esCritica ? (
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                      ) : isUnread ? (
                        <span className="block w-2 h-2 mt-1.5 rounded-full bg-amber-500" />
                      ) : (
                        <Check className="h-4 w-4 text-muted-foreground/50" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold ${n.esCritica ? 'text-red-600 dark:text-red-400' : isUnread ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {n.titulo}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.mensaje}</p>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">{tiempoRelativo(n.createdAt)}</p>
                    </div>
                  </button>
                )
              })
            )}
          </div>

          <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border bg-card/80 shrink-0">
            <button
              onClick={marcarTodasLeidas}
              disabled={marking || noLeidasCount === 0 || (noLeidasCount === criticasCount && criticasCount > 0)}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {marking ? 'Marcando…' : 'Marcar todas como leídas'}
            </button>
            <Link
              href="/notificaciones"
              onClick={() => setOpen(false)}
              className="text-xs text-primary-500 hover:text-primary-400 flex items-center gap-1"
            >
              Ver todas <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
