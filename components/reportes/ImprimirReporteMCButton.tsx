'use client'

import { Button } from '@/components/ui/button'
import { Printer } from 'lucide-react'

/**
 * Botón para imprimir el reporte de Mesa de Control. Usa el diálogo de
 * impresión nativo del navegador + CSS `@media print` en la página para
 * ocultar los controles y compactar el layout. No genera PDF; el usuario
 * decide (imprimir físicamente o "Guardar como PDF").
 */
export function ImprimirReporteMCButton() {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => window.print()}
    >
      <Printer className="h-4 w-4" />
      Imprimir hoja
    </Button>
  )
}
