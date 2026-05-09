'use client'

import { useEffect, useState } from 'react'
import { Plus, X, Bell } from 'lucide-react'
import { CampanaNotificaciones } from '@/components/CampanaNotificaciones'
import { MiKaChat } from '@/components/chat/MiKaChat'

const STORAGE_KEY_PREFIX = 'mk-floating-cluster-collapsed'

interface Props {
  userId: string
}

/**
 * Cluster flotante en la esquina inferior derecha que agrupa la campana
 * de notificaciones (ARRIBA) + MiKa (abajo) en stack vertical.
 *
 *   - Estado expandido/colapsado por usuario (localStorage)
 *   - Default expandido en desktop, colapsado en móvil
 *   - Auto-expansión la primera vez que detecta una crítica activa
 *   - Master button (+) con badge cuando colapsado
 *
 * CampanaNotificaciones se mantiene montada siempre para que su polling
 * siga activo aún colapsado (así detectamos críticas que disparan
 * auto-expansión).
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
    if (collapsed === true) {
      setCollapsed(false)
    }
  }

  const isCollapsed = collapsed === true

  return (
    <>
      {/* ── Cluster expandido — bell ARRIBA, MiKa abajo ──────────────────────
          Siempre montado, se oculta vía CSS para que el polling de campana
          siga vivo y pueda gatillar auto-expansión cuando llega una crítica. */}
      <div
        className={`transition-opacity duration-200 ${isCollapsed ? 'invisible opacity-0 pointer-events-none' : 'opacity-100'}`}
        aria-hidden={isCollapsed}
      >
        {/* Botón colapsar (×) — al LADO IZQUIERDO de MiKa con buena separación
            (~40px gap, comparable al gap vertical del bell sobre MiKa).
            Outline naranja al presionar para feedback visual. */}
        <button
          onClick={() => toggle(true)}
          className="fixed bottom-5 right-[148px] z-50 w-10 h-10 rounded-full bg-white hover:bg-gray-100 text-gray-700 border-2 border-gray-300 hover:border-gray-400 active:border-orange-500 active:bg-orange-50 active:scale-95 shadow-lg flex items-center justify-center transition-all hover:scale-110"
          aria-label="Cerrar acciones flotantes"
          title="Cerrar"
          style={{ boxShadow: '0 4px 14px rgba(0,0,0,0.4)' }}
        >
          <X className="h-4 w-4" />
        </button>

        {/* Campana — ARRIBA de MiKa, mismo eje vertical (right-8) */}
        <div className="fixed bottom-[88px] right-8 z-50">
          <CampanaNotificaciones
            onCountChange={(n, c) => {
              setNoLeidas(n)
              setCriticas(c)
            }}
            onCriticaDetected={onCriticaDetected}
          />
        </div>

        {/* MiKa mantiene su posición original (bottom-5 right-8) */}
        <MiKaChat />
      </div>

      {/* ── Master button (+) cuando está colapsado ──────────────────────── */}
      {isCollapsed && (
        <button
          onClick={() => toggle(false)}
          className={`fixed bottom-5 right-8 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 ${
            criticas > 0
              ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse'
              : noLeidas > 0
                ? 'bg-amber-500 hover:bg-amber-400 text-white'
                : 'bg-orange-500 hover:bg-orange-400 text-white'
          }`}
          style={{
            boxShadow: criticas > 0
              ? '0 4px 24px rgba(220,38,38,0.7)'
              : noLeidas > 0
                ? '0 4px 20px rgba(245,158,11,0.5)'
                : '0 4px 20px rgba(249,115,22,0.5)',
          }}
          aria-label={`Abrir acciones${noLeidas > 0 ? ` (${noLeidas} notificaciones)` : ''}`}
          title="Mostrar campana y MiKa"
        >
          <Plus className="h-6 w-6" />
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
