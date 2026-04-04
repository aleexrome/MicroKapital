import { formatMoney } from '@/lib/utils'
import { format } from 'date-fns'
import type { TicketData } from '@/types'

interface TicketPreviewProps {
  data: TicketData
  className?: string
}

export function TicketPreview({ data, className }: TicketPreviewProps) {
  const line = '================================'
  const dash = '--------------------------------'
  const fecha = format(new Date(data.fecha), 'dd/MM/yyyy')
  const hora = format(new Date(data.fecha), 'HH:mm a')

  return (
    <div className={`ticket-preview bg-white border border-gray-200 rounded-lg p-4 text-xs font-mono overflow-auto ${className ?? ''}`}>
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
}[QR]
Verifica: ${data.qrCode ?? ''}
${line}
${centerText('Gracias por tu pago puntual', 32)}
${line}`}
      </pre>
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
