/**
 * Helpers para el flujo de "video de desembolso" — la evidencia
 * anti-fraude que sustituye a la foto. Vive aqui porque tanto el
 * endpoint de iniciar sesion como el de upload los usan.
 */

// Lista corta de palabras cortas, comunes y pronunciables — asi Whisper
// las reconoce con alta confiabilidad y el cliente no batalla al
// decirlas. Se evitan homofonos y palabras con acentos ambiguos.
const SUSTANTIVOS = [
  'LUNA', 'SOL', 'MESA', 'LIBRO', 'GATO', 'PERRO', 'CIELO', 'MAR',
  'RIO', 'CASA', 'PAN', 'FLOR', 'TREN', 'MANO', 'SILLA', 'VELA',
  'PUENTE', 'NIDO', 'RUEDA', 'PLATO',
]
const COLORES = ['AZUL', 'VERDE', 'ROJO', 'BLANCO', 'NEGRO', 'DORADO']

/**
 * Genera un nonce hablable tipo "MESA-VERDE-42".
 *
 * Formato: <sustantivo>-<color>-<NN> donde NN es un numero de 10 a 99.
 * El coord ve la palabra en pantalla y le pide al cliente que la
 * incluya al final del video. El server luego verifica que la
 * transcripcion de Whisper la contenga con tolerancia (case
 * insensitive, espacios/guiones toleran).
 */
export function generarPalabraDelDia(): string {
  const s = SUSTANTIVOS[Math.floor(Math.random() * SUSTANTIVOS.length)]
  const c = COLORES[Math.floor(Math.random() * COLORES.length)]
  const n = 10 + Math.floor(Math.random() * 90)
  return `${s}-${c}-${n}`
}

// Cuanto tiempo dura una sesion antes de que la palabra expire.
// Balance entre: dar tiempo al coord para explicar/grabar (5+ min) y
// no dejar la palabra viva tanto que un mal actor pueda usarla en
// otra sesion. Con 5 min es razonable.
export const SESION_DESEMBOLSO_TTL_MS = 5 * 60 * 1000

/**
 * Arma el guion humano que el coord muestra al cliente. Recibe los
 * datos del prestamo y devuelve el texto que el cliente debe decir en
 * el video. Se usa tanto en el endpoint (para que la UI lo muestre)
 * como en el validador (para comparar palabras clave contra la
 * transcripcion).
 */
export function armarGuion(params: {
  nombreCliente: string
  fechaHoy: Date
  monto: number
  palabraDelDia: string
}): string {
  const { nombreCliente, fechaHoy, monto, palabraDelDia } = params
  const fechaTxt = fechaHoy.toLocaleDateString('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
  const montoTxt = new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN', maximumFractionDigits: 0,
  }).format(monto)
  return `Hola, soy ${nombreCliente}. Hoy ${fechaTxt} recibí ${montoTxt} pesos gracias a MicroKapital. Código: ${palabraDelDia}.`
}
