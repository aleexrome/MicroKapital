'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface DateRangeCalendarProps {
  startDate: string | null
  endDate: string | null
  maxDate?: string
  minDate?: string
  onSelect: (start: string, end: string) => void
  onClose: () => void
}

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseYMD(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const DAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do']
const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

export function DateRangeCalendar({ startDate, endDate, maxDate, minDate, onSelect, onClose }: DateRangeCalendarProps) {
  const today = toYMD(new Date())
  const effectiveMax = maxDate ?? undefined
  const effectiveMin = minDate ?? undefined

  const initial = startDate ? parseYMD(startDate) : new Date()
  const [viewMonth, setViewMonth] = useState(initial.getMonth())
  const [viewYear, setViewYear] = useState(initial.getFullYear())

  const [rangeStart, setRangeStart] = useState<string | null>(startDate)
  const [rangeEnd, setRangeEnd] = useState<string | null>(endDate)
  const [hoveredDate, setHoveredDate] = useState<string | null>(null)

  const selecting = rangeStart && !rangeEnd

  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1)
    let startDow = firstDay.getDay()
    if (startDow === 0) startDow = 7
    startDow -= 1

    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
    const days: { date: string; day: number; inMonth: boolean; disabled: boolean }[] = []

    const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate()
    for (let i = startDow - 1; i >= 0; i--) {
      const d = prevMonthDays - i
      const m = viewMonth === 0 ? 11 : viewMonth - 1
      const y = viewMonth === 0 ? viewYear - 1 : viewYear
      const date = toYMD(new Date(y, m, d))
      const disabled = (effectiveMax && date > effectiveMax) || (effectiveMin && date < effectiveMin)
      days.push({ date, day: d, inMonth: false, disabled: !!disabled })
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = toYMD(new Date(viewYear, viewMonth, d))
      const disabled = (effectiveMax && date > effectiveMax) || (effectiveMin && date < effectiveMin)
      days.push({ date, day: d, inMonth: true, disabled: !!disabled })
    }

    const remaining = 42 - days.length
    for (let d = 1; d <= remaining; d++) {
      const m = viewMonth === 11 ? 0 : viewMonth + 1
      const y = viewMonth === 11 ? viewYear + 1 : viewYear
      const date = toYMD(new Date(y, m, d))
      const disabled = (effectiveMax && date > effectiveMax) || (effectiveMin && date < effectiveMin)
      days.push({ date, day: d, inMonth: false, disabled: !!disabled })
    }

    return days
  }, [viewMonth, viewYear, effectiveMax])

  function handleDayClick(date: string) {
    if (!rangeStart || rangeEnd) {
      setRangeStart(date)
      setRangeEnd(null)
    } else {
      if (date < rangeStart) {
        setRangeEnd(rangeStart)
        setRangeStart(date)
      } else {
        setRangeEnd(date)
      }
    }
  }

  function isInRange(date: string) {
    const start = rangeStart
    const end = rangeEnd || (selecting ? hoveredDate : null)
    if (!start || !end) return false
    const lo = start < end ? start : end
    const hi = start < end ? end : start
    return date >= lo && date <= hi
  }

  function isStart(date: string) {
    return date === rangeStart
  }

  function isEnd(date: string) {
    if (rangeEnd) return date === rangeEnd
    if (selecting && hoveredDate) return date === hoveredDate
    return false
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1) }
    else setViewMonth(viewMonth - 1)
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1) }
    else setViewMonth(viewMonth + 1)
  }

  function handleApply() {
    if (rangeStart && rangeEnd) {
      onSelect(rangeStart, rangeEnd)
    } else if (rangeStart) {
      onSelect(rangeStart, rangeStart)
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-4 w-[320px]">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold">
          {MONTHS[viewMonth]} {viewYear}
        </span>
        <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map((d) => (
          <div key={d} className="text-center text-xs text-gray-500 font-medium py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {calendarDays.map((cell, i) => {
          const inRange = isInRange(cell.date)
          const start = isStart(cell.date)
          const end = isEnd(cell.date)
          const isEndpoint = start || end

          return (
            <button
              key={i}
              type="button"
              disabled={cell.disabled}
              onClick={() => handleDayClick(cell.date)}
              onMouseEnter={() => selecting && setHoveredDate(cell.date)}
              className={`
                relative h-9 text-sm transition-colors
                ${cell.disabled ? 'text-gray-700 cursor-not-allowed' : 'cursor-pointer'}
                ${!cell.inMonth && !cell.disabled ? 'text-gray-600' : ''}
                ${cell.inMonth && !cell.disabled && !inRange && !isEndpoint ? 'text-gray-300 hover:bg-gray-800' : ''}
                ${inRange && !isEndpoint ? 'bg-primary-500/20 text-primary-300' : ''}
                ${isEndpoint ? 'bg-primary-600 text-white font-bold' : ''}
                ${start ? 'rounded-l-lg' : ''}
                ${end ? 'rounded-r-lg' : ''}
                ${start && end ? 'rounded-lg' : ''}
              `}
            >
              {cell.day}
            </button>
          )
        })}
      </div>

      {/* Selection info + buttons */}
      <div className="mt-3 pt-3 border-t border-gray-700">
        {selecting && (
          <p className="text-xs text-primary-400 mb-2 text-center">
            Selecciona la fecha final
          </p>
        )}
        {rangeStart && rangeEnd && (
          <p className="text-xs text-gray-400 mb-2 text-center">
            {parseYMD(rangeStart).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
            {' — '}
            {parseYMD(rangeEnd).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
          </p>
        )}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 text-sm py-1.5 rounded-lg border border-gray-600 text-gray-400 hover:bg-gray-800"
          >
            Cancelar
          </button>
          <button
            onClick={handleApply}
            disabled={!rangeStart}
            className="flex-1 text-sm py-1.5 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700 disabled:opacity-40"
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  )
}
