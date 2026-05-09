'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Bell } from 'lucide-react'
import { CampanaNotificaciones } from '@/components/CampanaNotificaciones'
import { MiKaChat } from '@/components/chat/MiKaChat'

const STORAGE_KEY_PREFIX = 'mk-floating-cluster-collapsed'

interface Props {
  userId: string
}

/**
 * Cluster flotante en la esquina inferior derecha que agrupa la campana
 * de notificaciones + MiKa. Maneja:
 *
 *   - Estado expandido/colapsado por usuario (localStorage)
 *   - Default expandido en desktop, colapsado en móvil
 *   - Auto-expansión la primera vez que detecta una notificación crítica
 *   - Master button con badge cuando está colapsado
 *
 * El componente CampanaNotificaciones se mantiene montado siempre para
 * que su polling siga activo aún colapsado (así detectamos críticas que
 * disparan auto-expansión).
 */
export function FloatingActionsCluster({ userId }: Props) {
  const storageKey = `${STORAGE_KEY_PREFIX}:${userId}`
  // null mientras hidrata para evitar flash de estado equivocado.
  const [collapsed, setCollapsed] = useState<boolean | null>(null)
  const [noLeidas, setNoLeidas] = useState(0)
  const [criticas, setCriticas] = useState(0)
  const [autoExpanded, setAutoExpanded] = useState(false)

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null
    if (saved !== null) {
      setCollapsed(saved === '1')
      return
    }
    const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
    setCollapsed(isMobile)
  }, [storageKey])

  function toggle(next: boolean) {
    setCollapsed(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, next ? '1' : '0')
    }
  }

  function onCriticaDetected() {
    if (autoExpanded) return
    setAutoExpanded(true)
    // Si el usuario tenía colapsado, lo abrimos transitoriamente. NO
    // persistimos en localStorage para respetar su preferencia: si vuelve
    // a colapsar, se queda colapsado y solo el master button le avisa.
    if (collapsed === true) {
      setCollapsed(false)
    }
  }

  const isCollapsed = collapsed === true

  return (
    <>
      {/* Cluster expandido — siempre montado, ocultado vía CSS para que
          el polling de campana siga vivo y pueda gatillar auto-expansión. */}
      <div
        className={`transition-opacity duration-200 ${isCollapsed ? 'invisible opacity-0 pointer-events-none' : 'opacity-100'}`}
        aria-hidden={isCollapsed}
      >
        <MiKaChat />
        <div className="fixed bottom-5 right-24 z-50">
          <CampanaNotificaciones
            onCountChange={(n, c) => {
              setNoLeidas(n)
              setCriticas(c)
            }}
            onCriticaDetected={onCriticaDetected}
          />
        </div>
        <button
          onClick={() => toggle(true)}
          className="fixed bottom-20 right-8 z-50 w-7 h-7 rounded-full bg-card hover:bg-card/80 text-muted-foreground border border-border flex items-center justify-center shadow-md transition-all hover:scale-105"
          aria-label="Colapsar acciones flotantes"
          title="Colapsar"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Master button cuando está colapsado */}
      {isCollapsed && (
        <button
          onClick={() => toggle(false)}
          className={`fixed bottom-5 right-8 z-50 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 ${
            criticas > 0
              ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse'
              : noLeidas > 0
                ? 'bg-amber-500 hover:bg-amber-400 text-white'
                : 'bg-card hover:bg-card/80 text-foreground border border-border'
          }`}
          style={{
            boxShadow: criticas > 0
              ? '0 4px 20px rgba(220,38,38,0.6)'
              : noLeidas > 0
                ? '0 4px 20px rgba(245,158,11,0.5)'
                : '0 4px 12px rgba(0,0,0,0.2)',
          }}
          aria-label={`Expandir acciones${noLeidas > 0 ? ` (${noLeidas} notificaciones)` : ''}`}
          title="Mostrar campana y MiKa"
        >
          <ChevronUp className="h-4 w-4" />
          {noLeidas > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[22px] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center border-2 border-background gap-0.5">
              <Bell className="h-2.5 w-2.5" />
              {noLeidas > 99 ? '99+' : noLeidas}
            </span>
          )}
        </button>
      )}
    </>
  )
}
