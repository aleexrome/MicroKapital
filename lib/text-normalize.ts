/**
 * Utilidades de normalización de texto para búsqueda y comparación.
 *
 * Regla: para que el buscador de clientes no dependa de acentos ni
 * mayúsculas, guardamos una copia normalizada (nombreNormalizado) y
 * también normalizamos el término de búsqueda antes de hacer contains.
 */

/** Quita los diacríticos (acentos, tildes, diéresis, tilde de la ñ). */
export function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Forma canónica que guardamos en Client.nombreNormalizado y contra la
 * que buscamos: MAYÚSCULAS + sin acentos + espacios colapsados.
 */
export function normalizeNameForSearch(text: string): string {
  return stripAccents(text).toUpperCase().replace(/\s+/g, ' ').trim()
}
