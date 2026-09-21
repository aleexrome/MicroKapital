'use client'

import { Button } from '@/components/ui/button'
import { Printer, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface Props {
  backHref: string
}

/**
 * Barra de acciones de la vista "Estado financiero" imprimible:
 * un boton para volver al grupo y otro para lanzar window.print().
 * Ambos se ocultan con print:hidden para que no salgan en la hoja.
 */
export function PrintButton({ backHref }: Props) {
  return (
    <div className="flex items-center gap-2 print:hidden">
      <Button asChild variant="outline" size="sm">
        <Link href={backHref}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Regresar al grupo
        </Link>
      </Button>
      <Button size="sm" onClick={() => window.print()}>
        <Printer className="h-4 w-4 mr-1.5" />
        Imprimir
      </Button>
    </div>
  )
}
