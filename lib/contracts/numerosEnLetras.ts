/**
 * Convierte un número entero a su representación en letras en español
 * (mayúsculas), con soporte hasta cientos de millones. Se usa para los
 * pagarés de los contratos.
 *
 * Ejemplos:
 *   28000   → "VEINTIOCHO MIL"
 *   105500  → "CIENTO CINCO MIL QUINIENTOS"
 *   1000000 → "UN MILLÓN"
 *   1234567 → "UN MILLÓN DOSCIENTOS TREINTA Y CUATRO MIL QUINIENTOS SESENTA Y SIETE"
 *
 * `convertirMontoALetras` agrega el sufijo " PESOS XX/100 M.N." con
 * los centavos representados como dos dígitos.
 */

const UNIDADES = [
  '', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS',
  'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE',
]

const DECENAS = [
  '', '', 'VEINTI', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA',
]

const CENTENAS = [
  '', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
  'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS',
]

function convertirMenosDeCien(n: number): string {
  if (n <= 20) return UNIDADES[n]
  if (n < 30) {
    // 21-29 → "VEINTIUNO", "VEINTIDÓS", etc.
    const u = n - 20
    if (u === 0) return 'VEINTE'
    return DECENAS[2] + UNIDADES[u].toLowerCase().toUpperCase()
  }
  const decena = Math.floor(n / 10)
  const unidad = n % 10
  if (unidad === 0) return DECENAS[decena]
  return `${DECENAS[decena]} Y ${UNIDADES[unidad]}`
}

function convertirMenosDeMil(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'CIEN'
  const centena = Math.floor(n / 100)
  const resto = n % 100
  const partes: string[] = []
  if (centena > 0) partes.push(CENTENAS[centena])
  if (resto > 0) partes.push(convertirMenosDeCien(resto))
  return partes.join(' ')
}

export function convertirEnteroALetras(n: number): string {
  if (!Number.isFinite(n) || n < 0) return ''
  const num = Math.floor(n)
  if (num === 0) return 'CERO'

  const millones = Math.floor(num / 1_000_000)
  const miles    = Math.floor((num % 1_000_000) / 1000)
  const resto    = num % 1000

  const partes: string[] = []

  if (millones > 0) {
    if (millones === 1) {
      partes.push('UN MILLÓN')
    } else {
      partes.push(`${convertirMenosDeMil(millones)} MILLONES`)
    }
  }

  if (miles > 0) {
    if (miles === 1) {
      partes.push('MIL')
    } else {
      partes.push(`${convertirMenosDeMil(miles)} MIL`)
    }
  }

  if (resto > 0) {
    partes.push(convertirMenosDeMil(resto))
  }

  return partes.join(' ').trim()
}

/**
 * Convierte un monto a la frase completa para un pagaré.
 * Ejemplo: 28500.50 → "VEINTIOCHO MIL QUINIENTOS PESOS 50/100 M.N."
 */
export function convertirMontoALetras(monto: number): string {
  const entero = Math.floor(monto)
  const centavos = Math.round((monto - entero) * 100)
  const enteroLetras = convertirEnteroALetras(entero)
  const cents = String(centavos).padStart(2, '0')
  return `${enteroLetras} PESOS ${cents}/100 M.N.`
}
