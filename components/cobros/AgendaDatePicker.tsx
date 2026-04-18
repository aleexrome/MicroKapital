'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, CalendarDays, CalendarRange } from 'lucide-react'
import { useRef, useState } from 'react'
import { DateRangeCalendar } from './DateRangeCalendar'

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

function formatRangeLabel(start: string, end: string) {
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  return `${s.toLocaleDateString('es-MX', opts)} — ${e.toLocaleDateString('es-MX', opts)}`
}

interface AgendaDatePickerProps {
  fecha: string
  fechaFin?: string
  baseHref: string
  extraParams?: Record<string, string>
  maxDate?: string
  minDate?: string
}

export function AgendaDatePicker({ fecha, fechaFin, baseHref, extraParams = {}, maxDate, minDate }: AgendaDatePickerProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [showRangeCalendar, setShowRangeCalendar] = useState(false)

  const isRange = !!fechaFin && fechaFin !== fecha

  function navigate(newFecha: string, newFechaFin?: string) {
    const params = new URLSearchParams({ ...extraParams, fecha: newFecha })
    if (newFechaFin && newFechaFin !== newFecha) params.set('fechaFin', newFechaFin)
    router.push(`${baseHref}?${params.toString()}`)
  }

  const effectiveMax = maxDate ?? undefined
  const effectiveMin = minDate ?? undefined
  const forwardDisabled = effectiveMax ? addDays(fecha, 1) > effectiveMax : false
  const backwardDisabled = effectiveMin ? addDays(fecha, -1) < effectiveMin : false

  return (
    <div className="relative flex items-center gap-2">
      <div className="flex items-center gap-1 bg-muted/40 rounded-xl p-1">
        {/* Prev day */}
        <button
          onClick={() => navigate(addDays(fecha, isRange ? 0 : -1), isRange ? addDays(fechaFin!, -1) : undefined)}
          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          title="Dia anterior"
          disabled={backwardDisabled}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Date display */}
        {isRange ? (
          <button
            onClick={() => setShowRangeCalendar((v) => !v)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <CalendarRange className="h-4 w-4 text-primary-400" />
            <span className="text-sm font-semibold min-w-[140px] text-center">
              {formatRangeLabel(fecha, fechaFin!)}
            </span>
          </button>
        ) : (
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
              max={effectiveMax || undefined}
              min={effectiveMin || undefined}
              onChange={(e) => {
                const v = e.target.value
                if (!v) return
                if (effectiveMax && v > effectiveMax) return
                if (effectiveMin && v < effectiveMin) return
                navigate(v)
              }}
              className="absolute inset-0 opacity-0 w-full cursor-pointer"
            />
          </button>
        )}

        {/* Next day */}
        <button
          onClick={() => navigate(addDays(fecha, isRange ? 0 : 1), isRange ? addDays(fechaFin!, 1) : undefined)}
          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          title="Dia siguiente"
          disabled={isRange ? (effectiveMax ? addDays(fechaFin!, 1) > effectiveMax : false) : forwardDisabled}
        >
          <ChevronRight className={`h-4 w-4 ${(isRange ? (effectiveMax ? addDays(fechaFin!, 1) > effectiveMax : false) : forwardDisabled) ? 'opacity-30' : ''}`} />
        </button>
      </div>

      {/* Range toggle button */}
      <button
        onClick={() => setShowRangeCalendar((v) => !v)}
        className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-colors ${
          isRange || showRangeCalendar
            ? 'text-primary-400 bg-primary-500/10 border border-primary-500/30'
            : 'text-muted-foreground hover:text-primary-400 hover:bg-muted/40'
        }`}
        title="Seleccionar rango de fechas"
      >
        <CalendarRange className="h-3.5 w-3.5" />
        {isRange ? 'Cambiar rango' : 'Rango'}
      </button>

      {/* Clear range (back to single day) */}
      {isRange && (
        <button
          onClick={() => navigate(fecha)}
          className="text-xs text-muted-foreground hover:text-red-400 underline"
        >
          Un dia
        </button>
      )}

      {/* Floating range calendar */}
      {showRangeCalendar && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowRangeCalendar(false)}
          />
          <div className="absolute top-full left-0 mt-2 z-50">
            <DateRangeCalendar
              startDate={fecha}
              endDate={fechaFin ?? null}
              maxDate={effectiveMax}
              minDate={effectiveMin}
              onSelect={(start, end) => {
                navigate(start, end)
                setShowRangeCalendar(false)
              }}
              onClose={() => setShowRangeCalendar(false)}
            />
          </div>
        </>
      )}
    </div>
  )
}
