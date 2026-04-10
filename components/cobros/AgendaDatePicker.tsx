'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { useRef } from 'react'

function toYMD(d: Date) {
  return d.toISOString().split('T')[0]
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return toYMD(d)
}

function formatLabel(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  const today = toYMD(new Date())
  const yesterday = addDays(today, -1)
  const tomorrow = addDays(today, 1)
  if (dateStr === today) return 'Hoy'
  if (dateStr === yesterday) return 'Ayer'
  if (dateStr === tomorrow) return 'Mañana'
  return d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

interface AgendaDatePickerProps {
  fecha: string   // YYYY-MM-DD
  baseHref: string // e.g. "/cobros/pactados"
  extraParams?: Record<string, string>
  maxDate?: string // YYYY-MM-DD — no se puede avanzar más allá de esta fecha (default: hoy)
}

export function AgendaDatePicker({ fecha, baseHref, extraParams = {}, maxDate }: AgendaDatePickerProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  function navigate(newFecha: string) {
    const params = new URLSearchParams({ ...extraParams, fecha: newFecha })
    router.push(`${baseHref}?${params.toString()}`)
  }

  const effectiveMax = maxDate ?? toYMD(new Date())
  const forwardDisabled = addDays(fecha, 1) > effectiveMax

  return (
    <div className="flex items-center gap-1 bg-muted/40 rounded-xl p-1">
      {/* Prev day */}
      <button
        onClick={() => navigate(addDays(fecha, -1))}
        className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        title="Día anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {/* Date display — click to open native date picker */}
      <button
        onClick={() => inputRef.current?.showPicker?.() ?? inputRef.current?.click()}
        className="relative flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-muted transition-colors"
        title="Seleccionar fecha"
      >
        <CalendarDays className="h-4 w-4 text-primary-600" />
        <span className="text-sm font-semibold text-gray-900 min-w-[120px] text-center">
          {formatLabel(fecha)}
        </span>
        {/* Hidden native date input */}
        <input
          ref={inputRef}
          type="date"
          value={fecha}
          max={effectiveMax}
          onChange={(e) => { if (e.target.value && e.target.value <= effectiveMax) navigate(e.target.value) }}
          className="absolute inset-0 opacity-0 w-full cursor-pointer"
          style={{ colorScheme: 'light' }}
        />
      </button>

      {/* Next day */}
      <button
        onClick={() => navigate(addDays(fecha, 1))}
        className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        title="Día siguiente"
        disabled={forwardDisabled}
      >
        <ChevronRight className={`h-4 w-4 ${forwardDisabled ? 'opacity-30' : ''}`} />
      </button>
    </div>
  )
}
