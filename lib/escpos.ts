/**
 * ESC/POS commands for thermal printers via Web Bluetooth
 * Compatible with 58mm and 80mm thermal printers
 */

const ESC = 0x1b
const GS = 0x1d

export const CMD = {
  INIT: [ESC, 0x40],
  ALIGN_LEFT: [ESC, 0x61, 0x00],
  ALIGN_CENTER: [ESC, 0x61, 0x01],
  ALIGN_RIGHT: [ESC, 0x61, 0x02],
  BOLD_ON: [ESC, 0x45, 0x01],
  BOLD_OFF: [ESC, 0x45, 0x00],
  DOUBLE_HEIGHT_ON: [ESC, 0x21, 0x10],
  NORMAL_SIZE: [ESC, 0x21, 0x00],
  CUT: [GS, 0x56, 0x42, 0x00],
  LINE_FEED: [0x0a],
}

function textToBytes(text: string): number[] {
  const bytes: number[] = []
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    // Basic latin + common latin-1 supplement
    bytes.push(code > 255 ? 0x3f : code) // '?' for unsupported chars
  }
  return bytes
}

function line(text: string): number[] {
  return [...textToBytes(text), 0x0a]
}

function divider(char = '-', width = 32): number[] {
  return line(char.repeat(width))
}

function center(text: string, width = 32): string {
  if (text.length >= width) return text.slice(0, width)
  const pad = Math.floor((width - text.length) / 2)
  return ' '.repeat(pad) + text
}

function padRight(label: string, value: string, width = 32): string {
  const spaces = width - label.length - value.length
  return label + (spaces > 0 ? ' '.repeat(spaces) : ' ') + value
}

export interface PrintTicketOptions {
  empresa: string
  sucursal: string
  numeroTicket: string
  fecha: string
  hora: string
  cobrador: string
  cliente: string
  tipoPrestamo: string
  numeroPago: number
  totalPagos: number
  montoPagado: string
  metodoPago: string
  recibido?: string
  cambio?: string
  qrCode?: string
}

export function buildTicketBytes(opts: PrintTicketOptions): Uint8Array {
  const W = 32
  const bytes: number[] = [
    ...CMD.INIT,
    ...CMD.ALIGN_CENTER,
    ...CMD.BOLD_ON,
    ...line(opts.empresa.slice(0, W)),
    ...CMD.BOLD_OFF,
    ...line(opts.sucursal.slice(0, W)),
    ...CMD.ALIGN_LEFT,
    ...divider('=', W),
    ...line(`TICKET: ${opts.numeroTicket}`),
    ...line(`FECHA:  ${opts.fecha}`),
    ...line(`HORA:   ${opts.hora}`),
    ...divider('-', W),
    ...line(`COBRADOR: ${opts.cobrador.slice(0, W - 10)}`),
    ...divider('-', W),
    ...line(`CLIENTE: ${opts.cliente.slice(0, W - 9)}`),
    ...line(`TIPO: ${opts.tipoPrestamo}`),
    ...line(`PAGO No.: ${opts.numeroPago} de ${opts.totalPagos}`),
    ...divider('-', W),
    ...CMD.BOLD_ON,
    ...line(padRight('MONTO:', opts.montoPagado, W)),
    ...CMD.BOLD_OFF,
    ...line(`FORMA: ${opts.metodoPago}`),
  ]

  if (opts.recibido) {
    bytes.push(...divider('-', W))
    bytes.push(...line(padRight('RECIBIDO:', opts.recibido, W)))
    if (opts.cambio) {
      bytes.push(...line(padRight('CAMBIO:', opts.cambio, W)))
    }
  }

  bytes.push(
    ...divider('-', W),
    ...line(opts.qrCode ? `Verifica: ${opts.qrCode}` : ''),
    ...divider('=', W),
    ...CMD.ALIGN_CENTER,
    ...line(center('Gracias por tu pago puntual', W)),
    ...divider('=', W),
    ...CMD.LINE_FEED,
    ...CMD.LINE_FEED,
    ...CMD.LINE_FEED,
    ...CMD.CUT,
  )

  return new Uint8Array(bytes)
}

/**
 * Known UUIDs for common thermal printers — used as optionalServices hint.
 * The actual write characteristic is auto-detected at runtime.
 */
const KNOWN_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // common 58mm printers
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Xprinter / GoojPrt
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // some Epson-clone
  '0000ff00-0000-1000-8000-00805f9b34fb', // generic serial over BLE
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 / CC41 modules
]

/**
 * Find the first writable characteristic across all services on the device.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findWritableCharacteristic(server: any): Promise<any> {
  const services = await server.getPrimaryServices()
  for (const service of services) {
    const chars = await service.getCharacteristics()
    for (const char of chars) {
      const props = char.properties
      if (props.writeWithoutResponse || props.write) {
        return char
      }
    }
  }
  throw new Error('No se encontró una característica de escritura en la impresora. Verifica que sea compatible con BLE.')
}

export async function printViaBluetooth(data: Uint8Array): Promise<void> {
  // @ts-expect-error Web Bluetooth API
  const bt = navigator.bluetooth
  if (!bt) throw new Error('Este navegador no soporta Bluetooth. Usa Chrome o Edge.')

  const device = await bt.requestDevice({
    acceptAllDevices: true,
    optionalServices: KNOWN_SERVICES,
  })

  const server = await device.gatt.connect()
  const characteristic = await findWritableCharacteristic(server)

  // Send in 100-byte chunks with delay (safer for most BLE printers)
  const CHUNK = 100
  for (let i = 0; i < data.length; i += CHUNK) {
    const chunk = data.slice(i, i + CHUNK)
    try {
      if (characteristic.properties.writeWithoutResponse) {
        await characteristic.writeValueWithoutResponse(chunk)
      } else {
        await characteristic.writeValue(chunk)
      }
    } catch {
      // retry once after a short pause
      await new Promise((r) => setTimeout(r, 200))
      if (characteristic.properties.writeWithoutResponse) {
        await characteristic.writeValueWithoutResponse(chunk)
      } else {
        await characteristic.writeValue(chunk)
      }
    }
    await new Promise((r) => setTimeout(r, 30))
  }

  device.gatt.disconnect()
}
