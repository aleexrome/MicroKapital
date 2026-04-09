'use client'

import { useState, useRef, useEffect } from 'react'
import { Search, User, X } from 'lucide-react'

interface ClientResult {
  id: string
  nombreCompleto: string
  telefono: string | null
}

interface ClientSearchProps {
  value: string
  nombre: string
  onChange: (id: string, nombre: string) => void
  placeholder?: string
  disabled?: boolean
}

export function ClientSearch({ value, nombre, onChange, placeholder, disabled }: ClientSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ClientResult[]>([])
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (query.length < 2) { setResults([]); setOpen(false); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clients?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        setResults(data.data ?? [])
        setOpen(true)
      } catch { setResults([]) }
    }, 300)
  }, [query])

  // Cierra el dropdown al hacer clic fuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function select(client: ClientResult) {
    onChange(client.id, client.nombreCompleto)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  function clear() {
    onChange('', '')
  }

  return (
    <div ref={containerRef} className="relative">
      {value ? (
        // Cliente seleccionado
        <div className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm"
          style={{ background: 'hsl(var(--primary)/0.08)', borderColor: 'hsl(var(--primary)/0.4)' }}>
          <User className="h-4 w-4 shrink-0" style={{ color: 'hsl(var(--primary))' }} />
          <span className="flex-1 font-medium truncate">{nombre}</span>
          {!disabled && (
            <button type="button" onClick={clear}
              className="shrink-0 p-0.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ) : (
        // Buscador
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder ?? 'Buscar cliente por nombre...'}
            disabled={disabled}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
        </div>
      )}

      {open && results.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border shadow-xl overflow-hidden"
          style={{ background: 'hsl(var(--card))' }}>
          {results.slice(0, 8).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => select(c)}
              className="w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-muted/50 border-b border-border last:border-0"
            >
              <p className="font-medium">{c.nombreCompleto}</p>
              {c.telefono && <p className="text-xs text-muted-foreground">{c.telefono}</p>}
            </button>
          ))}
        </div>
      )}

      {open && query.length >= 2 && results.length === 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border shadow-xl px-3 py-3 text-sm text-muted-foreground"
          style={{ background: 'hsl(var(--card))' }}>
          No se encontraron clientes con ese nombre
        </div>
      )}
    </div>
  )
}
