'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export function PasswordInput() {
  const [show, setShow] = useState(false)

  return (
    <div className="relative">
      <input
        id="password" name="password" type={show ? 'text' : 'password'}
        placeholder="••••••••"
        required autoComplete="current-password"
        className="w-full rounded-xl border border-white/10 px-4 py-3 pr-12 text-sm text-white placeholder-white/25
                   focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-blue-500/40 transition-all"
        style={{ background: 'rgba(255,255,255,0.07)' }}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
        tabIndex={-1}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}
