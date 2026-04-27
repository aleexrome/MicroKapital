'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { ArrowLeft, Bluetooth, Download, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { formatMoney } from '@/lib/utils'
import { buildCorteCobradorBytes, printViaBluetooth, loadLogoBitmap } from '@/lib/escpos'

// Logo principal del sistema (PNG transparente). Mismo asset que las
// listas impresas. Para Bluetooth térmico se usa la versión rasterizada
// vía loadLogoBitmap.
const LOGO_URL = 'https://res.cloudinary.com/djs8dtzrq/image/upload/v1777329446/PHOTO-2026-04-27-16-21-06-removebg-preview_fczmpb.png'

interface PagoItem {
  cliente: string
  monto: number
  metodo: 'CASH' | 'CARD' | 'TRANSFER'
  statusTransferencia: string | null
}

interface Totales {
  efectivo: number
  tarjeta: number
  transferenciaVerificada: number
  enValidacion: number
  cambio: number
  general: number
}

interface Props {
  empresa: string
  sucursal: string
  cobrador: string
  fecha: string
  pagos: PagoItem[]
  totales: Totales
}

export function CortePrintView({ empresa, sucursal, cobrador, fecha, pagos, totales }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [printing, setPrinting] = useState(false)

  const fechaDate = new Date(fecha)
  const fechaLabel = format(fechaDate, 'dd/MM/yyyy')

  async function handleBluetoothPrint() {
    setPrinting(true)
    try {
      let logo: { pixels: Uint8Array; widthPx: number; heightPx: number } | undefined
      try {
        logo = await loadLogoBitmap(LOGO_URL, 384)
      } catch {
        // continuar sin logo
      }

      const bytes = buildCorteCobradorBytes({
        empresa,
        sucursal,
        cobrador,
        fecha: fechaLabel,
        totalEfectivo:      formatMoney(totales.efectivo),
        totalTarjeta:       formatMoney(totales.tarjeta),
        totalTransferencia: formatMoney(totales.transferenciaVerificada),
        totalEnValidacion:  totales.enValidacion > 0 ? formatMoney(totales.enValidacion) : undefined,
        totalCambio:        totales.cambio > 0 ? formatMoney(totales.cambio) : undefined,
        totalGeneral:       formatMoney(totales.general),
        pagos: pagos.map((p) => ({
          cliente: p.cliente,
          monto:   formatMoney(p.monto),
          metodo:  p.metodo,
        })),
        logo,
      })
      await printViaBluetooth(bytes)
      toast({ title: 'Corte enviado a la impresora' })
    } catch (err) {
      toast({
        title: 'Error Bluetooth',
        description: err instanceof Error ? err.message : 'No se pudo conectar a la impresora',
        variant: 'destructive',
      })
    } finally {
      setPrinting(false)
    }
  }

  function handlePdfPrint() {
    window.print()
  }

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .corte-preview { border: none !important; box-shadow: none !important; }
        }
        /* Logo solo visible al imprimir (PDF). Posición absoluta en la
           esquina superior derecha → no consume espacio en el flujo,
           el ticket térmico arranca pegado arriba. Sólo aparece en la
           primera página. */
        .brand-print-only { display: none; }
        @media print {
          .brand-print-only {
            display: block;
            position: absolute;
            top: 8px;
            right: 20px;
            margin: 0;
          }
          .brand-print-only img {
            height: 120px;
          }
        }
      `}</style>

      <div className="p-4 space-y-4 max-w-sm mx-auto">
        <div className="brand-print-only">
          <img src={LOGO_URL} alt="Logo" />
        </div>

        <div className="flex items-center gap-3 no-print">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-bold">Corte del día</h1>
        </div>

        {/* Preview estilo ticket térmico (32 cols, monoespaciado) */}
        <pre className="corte-preview font-mono text-[11px] leading-tight whitespace-pre bg-white text-gray-900 border rounded-md p-4 shadow-sm overflow-x-auto">
{renderPreview({ empresa, sucursal, cobrador, fechaLabel, pagos, totales })}
        </pre>

        <div className="flex flex-col gap-3 no-print">
          <Button className="w-full" onClick={handleBluetoothPrint} disabled={printing}>
            {printing
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <><Bluetooth className="h-4 w-4" /> Imprimir por Bluetooth</>
            }
          </Button>

          <Button variant="outline" className="w-full" onClick={handlePdfPrint}>
            <Download className="h-4 w-4" /> Guardar como PDF
          </Button>

          <Button variant="ghost" className="w-full" onClick={() => router.push('/caja')}>
            Volver a caja
          </Button>
        </div>
      </div>
    </>
  )
}

// Render del preview en texto monoespaciado, espejo de buildCorteCobradorBytes
function renderPreview({
  empresa, sucursal, cobrador, fechaLabel, pagos, totales,
}: {
  empresa: string
  sucursal: string
  cobrador: string
  fechaLabel: string
  pagos: PagoItem[]
  totales: Totales
}) {
  const W = 32
  const center = (s: string) => {
    const t = s.length >= W ? s.slice(0, W) : ' '.repeat(Math.floor((W - s.length) / 2)) + s
    return t
  }
  const padRight = (label: string, value: string) => {
    const sp = W - label.length - value.length
    return label + (sp > 0 ? ' '.repeat(sp) : ' ') + value
  }
  const dash = '-'.repeat(W)
  const eq   = '='.repeat(W)

  const lines: string[] = []
  lines.push(center(empresa.slice(0, W)))
  lines.push(center(sucursal.slice(0, W)))
  lines.push(center('CORTE DEL DIA'))
  lines.push(eq)
  lines.push(`COBRADOR: ${cobrador.slice(0, W - 10)}`)
  lines.push(`FECHA:    ${fechaLabel}`)
  lines.push(dash)
  lines.push('POR METODO DE PAGO')
  lines.push(padRight('Efectivo:',      formatMoney(totales.efectivo)))
  lines.push(padRight('Tarjeta:',       formatMoney(totales.tarjeta)))
  lines.push(padRight('Transferencia:', formatMoney(totales.transferenciaVerificada)))
  if (totales.enValidacion > 0) {
    lines.push(padRight('  En validacion:', formatMoney(totales.enValidacion)))
  }
  lines.push(dash)
  lines.push(padRight('TOTAL COBRADO:', formatMoney(totales.general)))
  if (totales.cambio > 0) {
    lines.push(padRight('Cambio entregado:', formatMoney(totales.cambio)))
    lines.push('(informativo, no resta)')
  }
  lines.push(dash)

  if (pagos.length > 0) {
    lines.push(`COBROS DEL DIA (${pagos.length})`)
    pagos.forEach((p, i) => {
      const idx = `${i + 1}.`.padEnd(3)
      const mark = p.metodo === 'CASH' ? '$' : p.metodo === 'CARD' ? 'T' : 'B'
      const prefix = `${idx}${mark} `
      const monto = formatMoney(p.monto)
      const maxName = W - prefix.length - monto.length - 1
      const nombre = p.cliente.length > maxName ? p.cliente.slice(0, maxName) : p.cliente
      lines.push(padRight(prefix + nombre, monto))
    })
    lines.push(dash)
  }

  lines.push('')
  lines.push('Firma:')
  lines.push(' _____________________________')
  lines.push('')
  lines.push(eq)

  return lines.join('\n')
}
