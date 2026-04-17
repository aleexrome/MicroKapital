'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, CalendarDays, CalendarRange } from 'lucide-react'
import { useRef, useState } from 'react'

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
  fecha: string
  fechaFin?: string
  baseHref: string
  extraParams?: Record<string, string>
  maxDate?: string
}

export function AgendaDatePicker({ fecha, fechaFin, baseHref, extraParams = {}, maxDate }: AgendaDatePickerProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [rangeMode, setRangeMode] = useState(!!fechaFin)

  function navigate(newFecha: string, newFechaFin?: string) {
    const params = new URLSearchParams({ ...extraParams, fecha: newFecha })
    if (newFechaFin) params.set('fechaFin', newFechaFin)
    router.push(`${baseHref}?${params.toString()}`)
  }

  const effectiveMax = maxDate ?? toYMD(new Date())
  const forwardDisabled = addDays(fecha, 1) > effectiveMax

  if (rangeMode) {
    return (
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
        <div className="flex items-center gap-2 bg-muted/40 rounded-xl p-2">
          <CalendarRange className="h-4 w-4 text-primary-400 ml-1" />
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-muted-foreground">Desde</label>
            <input
              type="date"
              value={fecha}
              max={effectiveMax}
              onChange={(e) => {
                if (e.target.value) navigate(e.target.value, fechaFin || effectiveMax)
              }}
              className="border border-gray-600 bg-gray-800 text-gray-100 rounded px-2 py-1 text-sm"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-muted-foreground">Hasta</label>
            <input
              type="date"
              value={fechaFin || effectiveMax}
              max={effectiveMax}
              min={fecha}
              onChange={(e) => {
                if (e.target.value) navigate(fecha, e.target.value)
              }}
              className="border border-gray-600 bg-gray-800 text-gray-100 rounded px-2 py-1 text-sm"
            />
          </div>
        </div>
        <button
          onClick={() => { setRangeMode(false); navigate(fecha) }}
          className="text-xs text-muted-foreground hover:text-primary-400 underline"
        >
          Ver por dia
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 bg-muted/40 rounded-xl p-1">
        <button
          onClick={() => navigate(addDays(fecha, -1))}
          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          title="Dia anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <button
          onClick={() => inputRef.current?.showPicker?.() ?? inputRef.current?.click()}
          className="relative flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-muted transition-colors"
          title="Seleccionar fecha"
        >
          <CalendarDays className="h-4 w-4 text-primary-600" />
          <span className="text-sm font-semibold min-w-[120px] text-center">
            {formatLabel(fecha)}
          </span>
          <input
            ref={inputRef}
            type="date"
            value={fecha}
            max={effectiveMax}
            onChange={(e) => { if (e.target.value && e.target.value <= effectiveMax) navigate(e.target.value) }}
            className="absolute inset-0 opacity-0 w-full cursor-pointer"
          />
        </button>

        <button
          onClick={() => navigate(addDays(fecha, 1))}
          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          title="Dia siguiente"
          disabled={forwardDisabled}
        >
          <ChevronRight className={`h-4 w-4 ${forwardDisabled ? 'opacity-30' : ''}`} />
        </button>
      </div>

      <button
        onClick={() => setRangeMode(true)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary-400 px-2 py-1 rounded-lg hover:bg-muted/40 transition-colors"
        title="Seleccionar rango de fechas"
      >
        <CalendarRange className="h-3.5 w-3.5" /> Rango
      </button>
    </div>
  )
}
