'use client'

import { Building2, Check, Copy } from 'lucide-react'
import { useState } from 'react'

interface BankAccountCardProps {
  banco:        string
  titular:      string
  clabe:        string
  numeroCuenta: string
  selected:     boolean
  disabled?:    boolean
  onSelect:     () => void
}

/**
 * Tarjeta visual para una cuenta destino de transferencia.
 *
 * Se usa en el flujo nuevo de validación de transferencias (Fase 1) —
 * la cobradora elige una cuenta tocando la tarjeta, y el sistema genera
 * el código único. El diseño enfatiza el banco (etiqueta grande),
 * ofrece botón de copiar la CLABE para armar la transferencia desde la
 * banca del cliente, y marca visualmente la selección con un borde
 * fucsia + check.
 *
 * No hace fetch — es puramente presentacional. El parent es el dueño
 * del estado selectedId.
 */
export function BankAccountCard({
  banco,
  titular,
  clabe,
  numeroCuenta,
  selected,
  disabled,
  onSelect,
}: BankAccountCardProps) {
  const [copiado, setCopiado] = useState(false)

  async function copiarClabe(ev: React.MouseEvent) {
    ev.stopPropagation()
    try {
      await navigator.clipboard.writeText(clabe)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      // Clipboard puede fallar en algunos browsers sin HTTPS.
    }
  }

  const ultimos4 = clabe.slice(-4)

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`w-full text-left rounded-xl border-2 p-4 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
        selected
          ? 'border-fuchsia-500 bg-fuchsia-500/10 shadow-[0_0_20px_rgba(236,72,153,0.25)]'
          : 'border-gray-700 hover:border-gray-500 bg-gray-900/40'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`shrink-0 rounded-lg p-2 ${selected ? 'bg-fuchsia-500/20' : 'bg-gray-800'}`}>
          <Building2 className={`h-5 w-5 ${selected ? 'text-fuchsia-300' : 'text-gray-400'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-sm uppercase tracking-wide text-white truncate">{banco}</p>
            {selected && (
              <span className="shrink-0 flex items-center gap-1 text-xs text-fuchsia-300 font-medium">
                <Check className="h-3.5 w-3.5" />
                Seleccionada
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5 truncate">A nombre de {titular}</p>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-gray-500">CLABE</p>
              <p className="text-sm font-mono text-gray-200 truncate">{clabe}</p>
            </div>
            {numeroCuenta && (
              <div className="shrink-0">
                <p className="text-[10px] uppercase tracking-wider text-gray-500">Cuenta</p>
                <p className="text-sm font-mono text-gray-300">•• {ultimos4}</p>
              </div>
            )}
            <button
              type="button"
              onClick={copiarClabe}
              className={`shrink-0 rounded-md p-1.5 transition-colors ${
                copiado ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
              }`}
              title="Copiar CLABE"
            >
              {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </button>
  )
}
