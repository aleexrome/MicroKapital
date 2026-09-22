/**
 * Checks de la transcripción del video de desembolso vs los datos del
 * préstamo. Cada función regresa `{ ok, detalle }` — un objeto simple
 * que va al JSON de validación guardado en Loan.desembolsoValidacion.
 *
 * Diseño: tolerante pero verificable. Los clientes van a decir el
 * guion con pronunciación imperfecta o con ligeras variaciones; se
 * usa normalización básica y matching flexible (levenshtein simple)
 * para nombres, y parseo de números / fechas en español.
 */

// ─── Utilidades comunes ─────────────────────────────────────────────
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // quita acentos
    .replace(/[^\w\s-]/g, ' ')        // quita puntuación (menos guiones)
    .replace(/\s+/g, ' ')
    .trim()
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[m][n]
}

/** Busca `needle` en `haystack` tolerando ~20% de caracteres distintos. */
function contieneFuzzy(haystack: string, needle: string, tolerancia = 0.2): boolean {
  const h = normalizar(haystack)
  const n = normalizar(needle)
  if (n.length === 0) return false
  if (h.includes(n)) return true
  // Sliding window sobre haystack midiendo Levenshtein
  const maxDist = Math.max(1, Math.floor(n.length * tolerancia))
  const words = h.split(' ')
  const nWords = n.split(' ').length
  for (let i = 0; i + nWords <= words.length; i++) {
    const chunk = words.slice(i, i + nWords).join(' ')
    if (levenshtein(chunk, n) <= maxDist) return true
  }
  return false
}


// ─── Check: nombre del cliente ──────────────────────────────────────
/**
 * Basta con que la transcripción contenga el primer nombre + primer
 * apellido con tolerancia. "Marta Perez Lopez" pasa si el cliente es
 * "María Marta Pérez López García" — es aceptable porque el nombre
 * completo con 4 tokens es raro que se diga completo.
 */
export function checkNombre(transcripcion: string, nombreCompleto: string): { ok: boolean; detalle: string } {
  const tokens = normalizar(nombreCompleto).split(' ').filter(Boolean)
  if (tokens.length === 0) return { ok: false, detalle: 'No se pudo determinar el nombre del cliente' }
  const primerNombre = tokens[0]
  // El primer apellido suele ser el token del medio o penúltimo — en
  // convención mexicana, después de N nombres. Tomamos el más largo
  // de los tokens que no son el primero para maximizar señal.
  const candidatosApellido = tokens.slice(1).sort((a, b) => b.length - a.length)
  const primerApellido = candidatosApellido[0] ?? ''

  const okNombre    = contieneFuzzy(transcripcion, primerNombre)
  const okApellido  = primerApellido.length > 0 ? contieneFuzzy(transcripcion, primerApellido) : true

  return {
    ok: okNombre && okApellido,
    detalle: okNombre && okApellido
      ? `Nombre reconocido (${primerNombre} + ${primerApellido})`
      : `Falta ${!okNombre ? primerNombre : ''}${!okNombre && !okApellido ? ' + ' : ''}${!okApellido ? primerApellido : ''} en el audio`,
  }
}


// ─── Check: palabra del día (nonce) ─────────────────────────────────
/**
 * La palabra del día es tipo "MESA-VERDE-42". El cliente la va a decir
 * como "mesa verde cuarenta y dos" o similar. Verificamos que los 3
 * tokens (sustantivo, color, número) estén presentes. Los guiones no
 * se pronuncian.
 */
export function checkPalabraDelDia(transcripcion: string, palabra: string): { ok: boolean; detalle: string } {
  const partes = palabra.split('-')
  if (partes.length !== 3) return { ok: false, detalle: 'Palabra del día mal formada' }
  const [sust, color, numStr] = partes
  const num = parseInt(numStr, 10)

  const t = normalizar(transcripcion)
  const okSust  = contieneFuzzy(t, sust)
  const okColor = contieneFuzzy(t, color)

  // Número: buscar tanto "42" como "cuarenta y dos" en la transcripción.
  const numTexto = numeroATexto(num)
  const okNum = t.includes(String(num)) || contieneFuzzy(t, numTexto, 0.15)

  const ok = okSust && okColor && okNum
  return {
    ok,
    detalle: ok
      ? `Palabra del día reconocida (${sust} ${color} ${num})`
      : `Falta ${[!okSust && sust, !okColor && color, !okNum && numTexto].filter(Boolean).join(' / ')} en el audio`,
  }
}


// ─── Check: fecha ───────────────────────────────────────────────────
/**
 * Verifica que la transcripción contenga la fecha de hoy en formato
 * legible en español. Se comparan mes y día — el año se omite porque
 * casi nadie lo dice al hablar. Tolerancia: ±1 día para el caso "el
 * cliente lo grabó justo pasadas las 12 de la noche".
 */
export function checkFecha(transcripcion: string, hoy: Date): { ok: boolean; detalle: string } {
  const t = normalizar(transcripcion)
  const dias = [hoy.getDate() - 1, hoy.getDate(), hoy.getDate() + 1].filter((d) => d >= 1 && d <= 31)
  const meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ]
  const mesActual = meses[hoy.getMonth()]

  const diaOk = dias.some((d) => {
    // Busca "hoy 25", "el 25", "recibí 25" o "veinticinco de..."
    return t.includes(` ${d} `) || t.includes(` ${d} de `) || contieneFuzzy(t, numeroATexto(d), 0.15)
  })
  const mesOk = contieneFuzzy(t, mesActual, 0.15)

  const ok = diaOk && mesOk
  return {
    ok,
    detalle: ok
      ? `Fecha reconocida (${hoy.getDate()} de ${mesActual})`
      : `Falta ${!diaOk ? 'día' : ''}${!diaOk && !mesOk ? ' y ' : ''}${!mesOk ? `mes (${mesActual})` : ''} en el audio`,
  }
}


// ─── Check: monto ───────────────────────────────────────────────────
/**
 * Verifica que la transcripción contenga el monto del préstamo con
 * tolerancia de ±$50 (por si el cliente redondea o pronuncia mal).
 * Acepta números en dígitos (5000) o en texto ("cinco mil pesos").
 */
export function checkMonto(transcripcion: string, capitalEsperado: number, tolerancia = 50): { ok: boolean; detalle: string } {
  const t = normalizar(transcripcion)
  // Extrae todos los números en dígitos o en palabras.
  const numsDigitos = Array.from(t.matchAll(/(\d[\d,]{2,})/g))
    .map((m) => parseInt(m[1].replace(/,/g, ''), 10))
    .filter((n) => !isNaN(n) && n >= 100)
  const numsTexto = extraerNumerosEnPalabras(t)
  const todosRaw = [...numsDigitos, ...numsTexto]

  // Filtro anti-falso-positivo: los años (1900-2100) casi siempre son
  // parte de la fecha que dijo el cliente ("dos mil veintiseis"), no
  // del monto. Los excluimos como candidatos SALVO que el
  // capitalEsperado sea exactamente un año — caso extremo pero
  // posible ($2026 de prestamo). Sin este filtro, la fecha
  // "22 de septiembre del dos mil veintiseis" mete 2026 en la lista
  // y el check falla aunque el cliente si haya dicho "cinco mil".
  const capitalEsAño = capitalEsperado >= 1900 && capitalEsperado <= 2100
  const todos = capitalEsAño
    ? todosRaw
    : todosRaw.filter((n) => !(n >= 1900 && n <= 2100))

  const match = todos.find((n) => Math.abs(n - capitalEsperado) <= tolerancia)
  const ok = match !== undefined
  return {
    ok,
    detalle: ok
      ? `Monto reconocido ($${match} vs esperado $${capitalEsperado})`
      : `No se detectó el monto esperado $${capitalEsperado} en el audio (encontrados: ${todos.slice(0, 3).join(', ') || 'ninguno'})`,
  }
}


// ─── Helpers de conversión número ↔ texto ───────────────────────────
const UNIDADES = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve']
const DIEZ_A_29: Record<number, string> = {
  10: 'diez', 11: 'once', 12: 'doce', 13: 'trece', 14: 'catorce', 15: 'quince',
  16: 'dieciseis', 17: 'diecisiete', 18: 'dieciocho', 19: 'diecinueve',
  20: 'veinte', 21: 'veintiuno', 22: 'veintidos', 23: 'veintitres', 24: 'veinticuatro',
  25: 'veinticinco', 26: 'veintiseis', 27: 'veintisiete', 28: 'veintiocho', 29: 'veintinueve',
}
const DECENAS: Record<number, string> = {
  30: 'treinta', 40: 'cuarenta', 50: 'cincuenta', 60: 'sesenta', 70: 'setenta', 80: 'ochenta', 90: 'noventa',
}

function numeroATexto(n: number): string {
  if (n < 10) return UNIDADES[n]
  if (n <= 29) return DIEZ_A_29[n]
  if (n <= 99) {
    const dec = Math.floor(n / 10) * 10
    const uni = n % 10
    return uni === 0 ? DECENAS[dec] : `${DECENAS[dec]} y ${UNIDADES[uni]}`
  }
  // Simple para números grandes usados en montos ($5000 = "cinco mil").
  if (n === 100) return 'cien'
  if (n < 1000) {
    const centenas = Math.floor(n / 100)
    const resto = n % 100
    const centenasStr = centenas === 1 ? 'ciento' : `${UNIDADES[centenas]}cientos`
    return resto === 0 ? centenasStr : `${centenasStr} ${numeroATexto(resto)}`
  }
  if (n < 1_000_000) {
    const miles = Math.floor(n / 1000)
    const resto = n % 1000
    const milesStr = miles === 1 ? 'mil' : `${numeroATexto(miles)} mil`
    return resto === 0 ? milesStr : `${milesStr} ${numeroATexto(resto)}`
  }
  return String(n)
}

/**
 * Extrae los números (en palabras) que aparecen en la transcripción.
 * Cubre los casos típicos que un cliente diría al leer un monto:
 * "cinco mil", "diez mil", "cinco mil quinientos", "cinco mil pesos",
 * "quince mil doscientos", etc. Se resuelve palabra por palabra
 * sumando en frases hasta que se rompe la cadena numérica.
 */
function extraerNumerosEnPalabras(txt: string): number[] {
  const palabras = txt.split(' ')
  const resultados: number[] = []

  // Tabla plana palabra → valor
  const tabla: Record<string, number> = {}
  for (let i = 0; i < UNIDADES.length; i++) tabla[UNIDADES[i]] = i
  for (const [k, v] of Object.entries(DIEZ_A_29)) tabla[v] = Number(k)
  for (const [k, v] of Object.entries(DECENAS)) tabla[v] = Number(k)
  tabla['cien']         = 100
  tabla['ciento']       = 100
  tabla['doscientos']   = 200
  tabla['trescientos']  = 300
  tabla['cuatrocientos']= 400
  tabla['quinientos']   = 500
  tabla['seiscientos']  = 600
  tabla['setecientos']  = 700
  tabla['ochocientos']  = 800
  tabla['novecientos']  = 900
  tabla['mil']          = 1000
  tabla['millon']       = 1_000_000
  tabla['millones']     = 1_000_000

  let acumulado = 0
  let ultimo = 0
  for (const p of palabras) {
    if (p === 'y') continue
    if (p in tabla) {
      const v = tabla[p]
      if (v === 1000 || v === 1_000_000) {
        // Multiplicador — multiplica lo acumulado hasta ahora.
        const base = acumulado === 0 && ultimo === 0 ? 1 : (ultimo || acumulado)
        acumulado = (acumulado - ultimo) + base * v
        ultimo = 0
      } else {
        ultimo = v
        acumulado += v
      }
    } else {
      if (acumulado > 0) {
        resultados.push(acumulado)
        acumulado = 0
        ultimo = 0
      }
    }
  }
  if (acumulado > 0) resultados.push(acumulado)
  return resultados
}


// ─── Exports auxiliares para tests / audit ─────────────────────────
export const _internal = { normalizar, levenshtein, contieneFuzzy, numeroATexto, extraerNumerosEnPalabras }
