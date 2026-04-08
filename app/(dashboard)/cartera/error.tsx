'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function CarteraError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Cartera Error]', error)
  }, [error])

  return (
    <div className="p-8 max-w-xl mx-auto space-y-4">
      <h2 className="text-lg font-semibold text-red-600">Error en cartera</h2>
      <p className="text-sm text-gray-700 font-mono bg-red-50 p-3 rounded border border-red-200 break-all">
        {error.message || 'Error desconocido'}
      </p>
      {error.digest && (
        <p className="text-xs text-muted-foreground">Digest: {error.digest}</p>
      )}
      <Button onClick={reset} variant="outline" size="sm">Reintentar</Button>
    </div>
  )
}
