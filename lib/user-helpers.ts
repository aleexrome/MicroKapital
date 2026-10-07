/**
 * Devuelve las iniciales de un nombre completo: primera letra del
 * primer nombre + primera letra del primer apellido.
 *
 * Convención mexicana: `User.nombre` suele venir como
 * "Nombre Apellido1 Apellido2" o "Nombre1 Nombre2 Apellido1 Apellido2".
 * El SEGUNDO token (índice 1) se trata como el primer apellido en el
 * caso simple de 2 tokens; con 3+ tokens se usa el ante-último o el
 * segundo según cuente de tokens.
 *
 * Reglas:
 *   - 1 token  → primera letra. "Carol" → "C"
 *   - 2 tokens → primera de cada uno. "Alejandro Romero" → "AR"
 *   - 3+ tokens → primera del primer token + primera del ante-último
 *     (asumiendo convención mex donde los últimos 2 son apellidos y
 *     el ante-último es el paterno). "Deysi Alondra Guadarrama Becerra"
 *     → "DG"
 *
 * Fallback: si nombre está vacío o es whitespace, devuelve "?".
 */
export function getIniciales(nombre: string | null | undefined): string {
  if (!nombre) return '?'
  const tokens = nombre
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (tokens.length === 0) return '?'
  if (tokens.length === 1) {
    return (tokens[0]!.charAt(0) || '?').toUpperCase()
  }
  // 2 tokens: primera + primera. 3+: primera del primero + primera
  // del ante-último (apellido paterno en convención mexicana).
  const first  = tokens[0]!
  const second = tokens.length === 2 ? tokens[1]! : tokens[tokens.length - 2]!
  return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase()
}
