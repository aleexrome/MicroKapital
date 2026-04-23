'use client'

import { formatMoney } from '@/lib/utils'
import { format } from 'date-fns'
import { useEffect, useState } from 'react'
import type { TicketData } from '@/types'

const LOGO_URL = 'https://res.cloudinary.com/djs8dtzrq/image/upload/v1776487061/ddcb6871-4cff-422e-9a00-67d62aa6243f.png'

interface TicketPreviewProps {
  data: TicketData
  className?: string
}

export function TicketPreview({ data, className }: TicketPreviewProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const line = '================================'
  const dash = '--------------------------------'
  const fecha = format(new Date(data.fecha), 'dd/MM/yyyy')
  const hora = format(new Date(data.fecha), 'HH:mm a')

  useEffect(() => {
    if (!data.qrCode) return
    let cancelled = false
    import('qrcode').then(({ default: QRCode }) => {
      QRCode.toDataURL(data.qrCode!, { width: 120, margin: 1 })
        .then((url) => { if (!cancelled) setQrDataUrl(url) })
        .catch(() => {})
    })
    return () => { cancelled = true }
  }, [data.qrCode])

  return (
    <div className={`ticket-preview bg-white border border-gray-200 rounded-lg p-4 text-xs font-mono overflow-auto ${className ?? ''}`}>
      {/* Logo */}
      <div className="flex justify-center mb-2">
        <img src={LOGO_URL} alt="MicroKapital" className="h-16 w-auto object-contain" />
      </div>

      <pre className="whitespace-pre-wrap break-all leading-snug">
{`${line}
${centerText(data.empresa, 32)}
${centerText(data.sucursal, 32)}
${line}
TICKET: ${data.numeroTicket}
FECHA:  ${fecha}
HORA:   ${hora}
${dash}
COBRADOR: ${data.cobrador}
${dash}
CLIENTE: ${data.cliente}
PRÉSTAMO: #${data.loanId.slice(-8).toUpperCase()}
TIPO: ${data.tipoPrestamo}
PAGO No.: ${data.numeroPago} de ${data.totalPagos}
${dash}
MONTO PAGADO:  ${padLeft(formatMoney(data.montoPagado), 12)}
FORMA DE PAGO: ${data.metodoPago}
${dash}
${data.recibido !== undefined ? `RECIBIDO:  ${padLeft(formatMoney(data.recibido), 14)}\nCAMBIO:    ${padLeft(formatMoney(data.cambio ?? 0), 14)}\n${dash}\n` : ''}${
  data.desglose && data.desglose.length > 0
    ? `DESGLOSE:\n${data.desglose.map((d) => `  ${d.cantidad} x ${formatMoney(d.denominacion).padStart(8)} = ${formatMoney(d.subtotal)}`).join('\n')}\n${dash}\n`
    : ''
}${line}
${centerText('Gracias por tu pago puntual', 32)}
${line}`}
      </pre>

      {/* QR Code */}
      {qrDataUrl && (
        <div className="flex flex-col items-center mt-2">
          <img src={qrDataUrl} alt="QR de verificación" className="w-28 h-28" />
          <p className="text-[10px] text-gray-600 mt-1 text-center">
            Escanea para verificar este ticket
          </p>
          {data.qrCode && (
            <p className="text-[9px] text-gray-400 mt-1 break-all text-center max-w-[200px]">
              {data.qrCode}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function centerText(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width)
  const padding = Math.floor((width - text.length) / 2)
  return ' '.repeat(padding) + text
}

function padLeft(text: string, width: number): string {
  if (text.length >= width) return text
  return ' '.repeat(width - text.length) + text
}
