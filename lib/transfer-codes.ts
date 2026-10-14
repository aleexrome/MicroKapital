/**
 * Helpers para la validación de transferencias (Fase 1).
 *
 * El código generado es MK-XXXXXX, 6 chars tras el prefijo. El alfabeto
 * excluye caracteres visualmente ambiguos (0/O, 1/l/I) para evitar errores
 * al transcribir en la banca del cliente.
 *
 * Expira a las 6 horas de generado. Reintentos de generación para el
 * mismo (loanId + tipo + scheduleId/groupId) marcan los anteriores como
 * invalidados, para que la BD mantenga audit trail.
 */

/** Alfabeto sin caracteres confusos. 32 símbolos. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

const CODE_LENGTH = 6
export const CODE_PREFIX = 'MK-'
export const CODE_EXPIRATION_HOURS = 6

/**
 * Genera un código candidato aleatorio con el formato MK-XXXXXX.
 * NO verifica unicidad — eso lo hace el endpoint consultando BD.
 */
export function generateCodeCandidate(): string {
  let out = CODE_PREFIX
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length))
  }
  return out
}

/**
 * Devuelve la fecha de expiración desde now() en función de las horas
 * configuradas (6h por default). Usamos UTC para consistencia con los
 * timestamps que Prisma guarda.
 */
export function computeExpiresAt(nowMs = Date.now()): Date {
  return new Date(nowMs + CODE_EXPIRATION_HOURS * 60 * 60 * 1000)
}

/** True si el código ya no está activo (expirado, invalidado o usado). */
export function isCodeInactive(opts: {
  expiresAt: Date
  invalidatedAt: Date | null
  usedAt: Date | null
  now?: Date
}): boolean {
  const now = opts.now ?? new Date()
  return (
    opts.expiresAt.getTime() <= now.getTime() ||
    opts.invalidatedAt !== null ||
    opts.usedAt !== null
  )
}
