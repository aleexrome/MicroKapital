'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Printer, Bluetooth, BluetoothConnected, Download, Loader2, AlertTriangle } from 'lucide-react'
import type { TicketData } from '@/types'

// ESC/POS command constants
const ESC = 0x1b
const GS = 0x1d
const LF = 0x0a
const CUT = [GS, 0x56, 0x00]

function textToBytes(text: string): number[] {
  return Array.from(text).map((c) => c.charCodeAt(0))
}

function buildEscPosBuffer(ticket: TicketData): Uint8Array {
  const cmds: number[] = []

  // Initialize printer
  cmds.push(ESC, 0x40)

  // Center align
  cmds.push(ESC, 0x61, 0x01)
  // Bold ON
  cmds.push(ESC, 0x45, 0x01)
  cmds.push(...textToBytes(ticket.empresa), LF)
  cmds.push(...textToBytes(ticket.sucursal), LF)
  // Bold OFF
  cmds.push(ESC, 0x45, 0x00)

  // Left align
  cmds.push(ESC, 0x61, 0x00)
  cmds.push(...textToBytes('================================'), LF)
  cmds.push(...textToBytes(`TICKET: ${ticket.numeroTicket}`), LF)
  cmds.push(...textToBytes(`FECHA:  ${new Date(ticket.fecha).toLocaleDateString('es-MX')}`), LF)
  cmds.push(...textToBytes(`HORA:   ${new Date(ticket.fecha).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`), LF)
  cmds.push(...textToBytes('--------------------------------'), LF)
  cmds.push(...textToBytes(`COBRADOR: ${ticket.cobrador}`), LF)
  cmds.push(...textToBytes('--------------------------------'), LF)
  cmds.push(...textToBytes(`CLIENTE: ${ticket.cliente}`), LF)
  cmds.push(...textToBytes(`PRESTAMO: #${ticket.loanId.slice(-8).toUpperCase()}`), LF)
  cmds.push(...textToBytes(`TIPO: ${ticket.tipoPrestamo}`), LF)
  cmds.push(...textToBytes(`PAGO No.: ${ticket.numeroPago} de ${ticket.totalPagos}`), LF)
  cmds.push(...textToBytes('--------------------------------'), LF)
  cmds.push(...textToBytes(`MONTO PAGADO:  $${ticket.montoPagado.toFixed(2)}`), LF)
  cmds.push(...textToBytes(`FORMA DE PAGO: ${ticket.metodoPago}`), LF)

  if (ticket.recibido !== undefined) {
    cmds.push(...textToBytes('--------------------------------'), LF)
    cmds.push(...textToBytes(`RECIBIDO:  $${ticket.recibido.toFixed(2)}`), LF)
    cmds.push(...textToBytes(`CAMBIO:    $${(ticket.cambio ?? 0).toFixed(2)}`), LF)
  }

  if (ticket.desglose && ticket.desglose.length > 0) {
    cmds.push(...textToBytes('--------------------------------'), LF)
    cmds.push(...textToBytes('DESGLOSE:'), LF)
    ticket.desglose.forEach((d) => {
      cmds.push(...textToBytes(`  ${d.cantidad} x $${d.denominacion} = $${d.subtotal.toFixed(2)}`), LF)
    })
  }

  cmds.push(...textToBytes('--------------------------------'), LF)

  // Center + bold for footer
  cmds.push(ESC, 0x61, 0x01)
  cmds.push(ESC, 0x45, 0x01)
  cmds.push(...textToBytes('Gracias por tu pago puntual'), LF)
  cmds.push(ESC, 0x45, 0x00)
  cmds.push(...textToBytes('================================'), LF)

  // QR code (ESC/POS native QR commands — GS ( k)
  if (ticket.qrCode) {
    const qrData = ticket.qrCode
    const qrLen = qrData.length + 3

    // Model 2
    cmds.push(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00)
    // Module size (1-16) — use 6 for readable QR on thermal paper
    cmds.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06)
    // Error correction level — M
    cmds.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31)
    // Store data
    cmds.push(GS, 0x28, 0x6b, qrLen & 0xff, (qrLen >> 8) & 0xff, 0x31, 0x50, 0x30)
    cmds.push(...textToBytes(qrData))
    // Print
    cmds.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30)
    cmds.push(LF)
    cmds.push(...textToBytes('Escanea para verificar'), LF)
  }

  cmds.push(LF, LF, LF)

  // Cut
  cmds.push(...CUT)

  return new Uint8Array(cmds)
}

const BLE_SERVICE = '000018f0-0000-1000-8000-00805f9b34fb'
const BLE_CHARACTERISTIC = '00002af1-0000-1000-8000-00805f9b34fb'
const DEVICE_ID_KEY = 'thermal_printer_device_id'

interface ThermalPrinterProps {
  ticketData: TicketData
  onPrintSuccess?: () => void
}

export function ThermalPrinter({ ticketData, onPrintSuccess }: ThermalPrinterProps) {
  const { toast } = useToast()
  const [connected, setConnected] = useState(false)
  const [printing, setPrinting] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [bleDevice, setBleDevice] = useState<any>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isBluetoothSupported = typeof navigator !== 'undefined' && 'bluetooth' in (navigator as any)

  const connectPrinter = useCallback(async () => {
    if (!isBluetoothSupported) return

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [{ services: [BLE_SERVICE] }],
        optionalServices: [BLE_SERVICE],
      })

      setBleDevice(device)
      setConnected(true)
      localStorage.setItem(DEVICE_ID_KEY, device.id ?? '')

      toast({ title: '🖨️ Impresora conectada', description: device.name ?? 'Impresora térmica' })

      device.addEventListener('gattserverdisconnected', () => {
        setConnected(false)
        setBleDevice(null)
      })
    } catch (err) {
      if ((err as Error).name !== 'NotFoundError') {
        toast({ title: 'Error al conectar', description: (err as Error).message, variant: 'destructive' })
      }
    }
  }, [isBluetoothSupported, toast])

  const printTicket = useCallback(async () => {
    if (!bleDevice || !connected) return

    setPrinting(true)
    try {
      const server = await bleDevice.gatt?.connect()
      if (!server) throw new Error('No se pudo conectar al GATT server')

      const service = await server.getPrimaryService(BLE_SERVICE)
      const characteristic = await service.getCharacteristic(BLE_CHARACTERISTIC)

      const buffer = buildEscPosBuffer(ticketData)

      // Enviar en chunks de 512 bytes
      const CHUNK = 512
      for (let i = 0; i < buffer.length; i += CHUNK) {
        await characteristic.writeValueWithoutResponse(buffer.slice(i, i + CHUNK))
      }

      toast({ title: '✅ Ticket impreso', variant: 'default' })
      onPrintSuccess?.()
    } catch (err) {
      toast({
        title: 'Error de impresión',
        description: (err as Error).message,
        variant: 'destructive',
      })
    } finally {
      setPrinting(false)
    }
  }, [bleDevice, connected, ticketData, toast, onPrintSuccess])

  const downloadPDF = useCallback(async () => {
    // Fallback: generar PDF descargable
    // Aquí se puede integrar @react-pdf/renderer en el futuro
    const content = [
      `TICKET: ${ticketData.numeroTicket}`,
      `EMPRESA: ${ticketData.empresa}`,
      `SUCURSAL: ${ticketData.sucursal}`,
      `COBRADOR: ${ticketData.cobrador}`,
      `CLIENTE: ${ticketData.cliente}`,
      `PAGO ${ticketData.numeroPago}/${ticketData.totalPagos}`,
      `MONTO: $${ticketData.montoPagado.toFixed(2)}`,
      `MÉTODO: ${ticketData.metodoPago}`,
    ].join('\n')

    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ticket-${ticketData.numeroTicket}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }, [ticketData])

  if (!isBluetoothSupported) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-yellow-600 bg-yellow-50 rounded-lg p-3 text-sm">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>Bluetooth no disponible en este dispositivo</span>
        </div>
        <Button onClick={downloadPDF} variant="outline" className="w-full">
          <Download className="h-4 w-4" />
          Descargar ticket
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {!connected ? (
        <Button onClick={connectPrinter} variant="outline" className="w-full">
          <Bluetooth className="h-4 w-4" />
          Conectar impresora
        </Button>
      ) : (
        <div className="flex items-center gap-2 text-green-600 bg-green-50 rounded-lg p-3 text-sm">
          <BluetoothConnected className="h-4 w-4" />
          <span>Impresora conectada: {bleDevice?.name ?? 'Impresora térmica'}</span>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          onClick={printTicket}
          disabled={!connected || printing}
          className="flex-1"
        >
          {printing ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Imprimiendo...</>
          ) : (
            <><Printer className="h-4 w-4" /> Imprimir ticket</>
          )}
        </Button>

        <Button onClick={downloadPDF} variant="outline" size="icon" title="Descargar como texto">
          <Download className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
