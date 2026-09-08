/**
 * Helpers para concatenar la descomposicion de nombre y domicilio de
 * cliente / aval a los campos libres (nombreCompleto / domicilio) que
 * siguen viviendo para retro-compat (contratos viejos, prints, etc.).
 *
 * El formulario captura los subcampos por separado; el backend usa estos
 * helpers para escribir tambien los campos libres, y asi busquedas y
 * plantillas antiguas siguen funcionando sin cambios.
 */

export interface PersonaNombre {
  nombres?: string | null
  apellidoPaterno?: string | null
  apellidoMaterno?: string | null
}

export interface Domicilio {
  calle?: string | null
  numExt?: string | null
  numInt?: string | null
  colonia?: string | null
  municipio?: string | null
  estado?: string | null
  cp?: string | null
}

/**
 * Une nombres + apellidos en un solo string MAYUSCULAS con espacios
 * unicos. Si nada se capturo devuelve null.
 */
export function armarNombreCompleto(n: PersonaNombre): string | null {
  const partes = [n.nombres, n.apellidoPaterno, n.apellidoMaterno]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
  if (partes.length === 0) return null
  return partes.join(' ').toUpperCase().replace(/\s+/g, ' ').trim()
}

/**
 * Une los subcampos de direccion en una sola linea legible. Ej.:
 * "AV. REFORMA 123 INT. 4, COL. CENTRO, TOLUCA, EDO. MEX. CP 50000"
 */
export function armarDomicilioLibre(d: Domicilio): string | null {
  const calle = (d.calle ?? '').trim()
  const numExt = (d.numExt ?? '').trim()
  const numInt = (d.numInt ?? '').trim()
  const colonia = (d.colonia ?? '').trim()
  const municipio = (d.municipio ?? '').trim()
  const estado = (d.estado ?? '').trim()
  const cp = (d.cp ?? '').trim()

  const linea1 = [
    calle,
    numExt ? numExt : '',
    numInt ? `INT. ${numInt}` : '',
  ].filter(Boolean).join(' ')

  const partes = [
    linea1,
    colonia ? `COL. ${colonia}` : '',
    municipio,
    estado,
    cp ? `CP ${cp}` : '',
  ].filter(Boolean)

  if (partes.length === 0) return null
  return partes.join(', ').toUpperCase()
}
