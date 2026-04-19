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

/**
 * ESC/POS native QR code command.
 * Supported by most 58/80mm BLE printers (GoojPrt, Xprinter, Epson-clone, etc.).
 *   size  = 1–16  (module width in dots; 6–8 recommended for 58mm)
 *   level = 0 (L) | 1 (M) | 2 (Q) | 3 (H)
 */
export function buildQrBytes(data: string, size = 7, level: 0 | 1 | 2 | 3 = 1): number[] {
  const payload: number[] = []
  for (let i = 0; i < data.length; i++) payload.push(data.charCodeAt(i) & 0xff)

  const bytes: number[] = []

  // Select QR model (model 2)
  bytes.push(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00)

  // Set module size
  bytes.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, size & 0xff)

  // Set error correction level (48 + level)
  bytes.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x30 + level)

  // Store data  (pL + pH * 256 = payload.length + 3)
  const storeLen = payload.length + 3
  bytes.push(GS, 0x28, 0x6b, storeLen & 0xff, (storeLen >> 8) & 0xff, 0x31, 0x50, 0x30)
  bytes.push(...payload)

  // Print
  bytes.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30)

  return bytes
}

/**
 * Build ESC/POS GS v 0 raster image command from a monochrome bitmap.
 * pixels: 1-bit packed LEFT→RIGHT, TOP→BOTTOM. width must be multiple of 8.
 */
export function buildRasterBytes(pixels: Uint8Array, widthPx: number, heightPx: number): number[] {
  const widthBytes = widthPx / 8
  if (!Number.isInteger(widthBytes)) {
    throw new Error('widthPx debe ser múltiplo de 8')
  }
  const bytes: number[] = [
    GS, 0x76, 0x30, 0x00,
    widthBytes & 0xff, (widthBytes >> 8) & 0xff,
    heightPx & 0xff, (heightPx >> 8) & 0xff,
  ]
  for (let i = 0; i < pixels.length; i++) bytes.push(pixels[i])
  return bytes
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
  /** Bitmap 1-bit del logo; se imprime centrado al inicio del ticket */
  logo?: { pixels: Uint8Array; widthPx: number; heightPx: number }
}

export function buildTicketBytes(opts: PrintTicketOptions): Uint8Array {
  const W = 32
  const bytes: number[] = [...CMD.INIT, ...CMD.ALIGN_CENTER]

  if (opts.logo) {
    bytes.push(...buildRasterBytes(opts.logo.pixels, opts.logo.widthPx, opts.logo.heightPx))
    bytes.push(...CMD.LINE_FEED)
  }

  bytes.push(
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
  )

  if (opts.recibido) {
    bytes.push(...divider('-', W))
    bytes.push(...line(padRight('RECIBIDO:', opts.recibido, W)))
    if (opts.cambio) {
      bytes.push(...line(padRight('CAMBIO:', opts.cambio, W)))
    }
  }

  bytes.push(...divider('-', W))

  // QR de verificación
  if (opts.qrCode) {
    bytes.push(
      ...CMD.ALIGN_CENTER,
      ...buildQrBytes(opts.qrCode, 7, 1),
      ...CMD.LINE_FEED,
      ...line(center('Escanea para verificar', W)),
      ...CMD.ALIGN_LEFT,
      ...divider('-', W),
    )
  }

  bytes.push(
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

export interface GroupTicketIntegrante {
  cliente: string
  monto: string
  /** texto opcional tipo "Cubierta por Juanita" o "Cubrió a María" */
  nota?: string
}

export interface PrintGroupTicketOptions {
  empresa: string
  sucursal: string
  fecha: string
  hora: string
  cobrador: string
  grupoNombre: string
  integrantes: GroupTicketIntegrante[]
  totalCobrado: string
  metodoPago: string
  qrCode?: string
  logo?: { pixels: Uint8Array; widthPx: number; heightPx: number }
}

/** Ticket consolidado para cobro grupal (solidario) — una impresión con
 *  desglose por integrante, total y QR de verificación. */
export function buildGroupTicketBytes(opts: PrintGroupTicketOptions): Uint8Array {
  const W = 32
  const bytes: number[] = [...CMD.INIT, ...CMD.ALIGN_CENTER]

  if (opts.logo) {
    bytes.push(...buildRasterBytes(opts.logo.pixels, opts.logo.widthPx, opts.logo.heightPx))
    bytes.push(...CMD.LINE_FEED)
  }

  bytes.push(
    ...CMD.BOLD_ON,
    ...line(opts.empresa.slice(0, W)),
    ...CMD.BOLD_OFF,
    ...line(opts.sucursal.slice(0, W)),
    ...CMD.ALIGN_LEFT,
    ...divider('=', W),
    ...line(`FECHA:  ${opts.fecha}`),
    ...line(`HORA:   ${opts.hora}`),
    ...divider('-', W),
    ...line(`COBRADOR: ${opts.cobrador.slice(0, W - 10)}`),
    ...divider('-', W),
    ...CMD.BOLD_ON,
    ...line(`GRUPO: ${opts.grupoNombre.slice(0, W - 7)}`),
    ...CMD.BOLD_OFF,
    ...divider('-', W),
    ...line('INTEGRANTES:'),
  )

  for (const it of opts.integrantes) {
    // Nombre recortado a 24 chars + monto alineado a la derecha
    const nombre = it.cliente.length > 24 ? it.cliente.slice(0, 24) : it.cliente
    bytes.push(...line(padRight(nombre, it.monto, W)))
    if (it.nota) {
      bytes.push(...line(`  ${it.nota.slice(0, W - 2)}`))
    }
  }

  bytes.push(
    ...divider('-', W),
    ...CMD.BOLD_ON,
    ...line(padRight('TOTAL COBRADO:', opts.totalCobrado, W)),
    ...CMD.BOLD_OFF,
    ...line(`FORMA: ${opts.metodoPago}`),
    ...divider('-', W),
  )

  if (opts.qrCode) {
    bytes.push(
      ...CMD.ALIGN_CENTER,
      ...buildQrBytes(opts.qrCode, 7, 1),
      ...CMD.LINE_FEED,
      ...line(center('Escanea para verificar', W)),
      ...CMD.ALIGN_LEFT,
      ...divider('-', W),
    )
  }

  bytes.push(
    ...CMD.ALIGN_CENTER,
    ...line(center('Gracias por su pago puntual', W)),
    ...divider('=', W),
    ...CMD.LINE_FEED,
    ...CMD.LINE_FEED,
    ...CMD.LINE_FEED,
    ...CMD.CUT,
  )

  return new Uint8Array(bytes)
}

/**
 * Carga una imagen desde URL y la convierte a bitmap 1-bit para ESC/POS.
 * Se redimensiona manteniendo proporción para encajar en `targetWidthPx`
 * (múltiplo de 8). Usa umbral simple (promedio RGB + alpha) para monocromo.
 */
export async function loadLogoBitmap(
  url: string,
  targetWidthPx = 256,
): Promise<{ pixels: Uint8Array; widthPx: number; heightPx: number }> {
  if (targetWidthPx % 8 !== 0) throw new Error('targetWidthPx debe ser múltiplo de 8')

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.crossOrigin = 'anonymous'
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('No se pudo cargar el logo'))
    el.src = url
  })

  const widthPx = targetWidthPx
  const heightPx = Math.max(8, Math.round((img.height / img.width) * widthPx / 8) * 8)

  const canvas = document.createElement('canvas')
  canvas.width = widthPx
  canvas.height = heightPx
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D no disponible')
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, widthPx, heightPx)
  ctx.drawImage(img, 0, 0, widthPx, heightPx)

  const imgData = ctx.getImageData(0, 0, widthPx, heightPx).data
  const widthBytes = widthPx / 8
  const pixels = new Uint8Array(widthBytes * heightPx)

  for (let y = 0; y < heightPx; y++) {
    for (let x = 0; x < widthPx; x++) {
      const i = (y * widthPx + x) * 4
      const r = imgData[i], g = imgData[i + 1], b = imgData[i + 2], a = imgData[i + 3]
      // píxel "negro" si es oscuro y opaco
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b
      const black = a > 64 && luminance < 160
      if (black) {
        const byteIdx = y * widthBytes + (x >> 3)
        pixels[byteIdx] |= 1 << (7 - (x & 7))
      }
    }
  }

  return { pixels, widthPx, heightPx }
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
