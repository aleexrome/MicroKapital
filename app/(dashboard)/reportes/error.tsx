'use client'

/**
 * Error boundary del módulo Reportes. En producción Next.js oculta el
 * mensaje real, pero el `digest` sí llega — y el `error.message` también
 * cuando lo provocamos nosotros (ej: errores de Prisma con detalle).
 *
 * Esta UI imprime todo lo que tenemos para diagnosticar sin depender
 * de los logs de Vercel.
 */

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertOctagon, RefreshCw, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export default function ReportesError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // En consola del cliente: la traza completa
    console.error('[Reportes error]', error)
  }, [error])

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-4">
        <Link href="/dashboard" className="rounded-xl p-2 hover:bg-secondary transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-2xl font-bold text-foreground">Error en Reportes</h1>
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-rose-500/15 p-2.5 ring-1 ring-rose-500/30 shrink-0">
              <AlertOctagon className="h-5 w-5 text-rose-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground">Algo se rompió al cargar este reporte</p>
              <p className="text-sm text-muted-foreground mt-1">
                El detalle aparece abajo. Mándale un screenshot a soporte para diagnóstico.
              </p>
            </div>
          </div>

          <div className="rounded-lg bg-secondary/40 p-3 font-mono text-xs space-y-2 break-all">
            <div>
              <span className="text-muted-foreground uppercase tracking-wide text-[10px]">Mensaje</span>
              <p className="text-foreground mt-0.5">{error.message || '(sin mensaje)'}</p>
            </div>
            {error.digest && (
              <div>
                <span className="text-muted-foreground uppercase tracking-wide text-[10px]">Digest</span>
                <p className="text-foreground mt-0.5">{error.digest}</p>
              </div>
            )}
            {error.name && error.name !== 'Error' && (
              <div>
                <span className="text-muted-foreground uppercase tracking-wide text-[10px]">Tipo</span>
                <p className="text-foreground mt-0.5">{error.name}</p>
              </div>
            )}
            {error.stack && (
              <details>
                <summary className="cursor-pointer text-muted-foreground uppercase tracking-wide text-[10px]">
                  Stack trace (click)
                </summary>
                <pre className="text-foreground mt-2 whitespace-pre-wrap text-[10px] leading-relaxed">
                  {error.stack}
                </pre>
              </details>
            )}
          </div>

          <div className="flex gap-2">
            <Button onClick={reset} variant="default">
              <RefreshCw className="h-4 w-4" />
              Reintentar
            </Button>
            <Link href="/reportes">
              <Button variant="outline">Volver a Reportes</Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="ghost">Dashboard</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
