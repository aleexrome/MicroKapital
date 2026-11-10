/**
 * Valida si un File (o par {type, name}) corresponde a una imagen.
 *
 * iOS Safari tiene un bug conocido: fotos descargadas desde WhatsApp,
 * Mail, iMessage o la galería a veces llegan con `file.type === ""`
 * (mimetype vacío). Si solo validamos `file.type.startsWith('image/')`,
 * esas fotos se rechazan y el usuario ve "solo se aceptan imágenes".
 *
 * Fix: aceptar si el MIME dice imagen *o* si la extensión del archivo
 * es de un formato de imagen conocido. Mantiene el mismo set de
 * formatos documentado (jpg/png/webp/heic/heif/gif/bmp/svg).
 */
const IMG_EXT = /\.(jpe?g|png|webp|heic|heif|gif|bmp|svg)$/i

export function isImageFile(f: { type?: string | null; name?: string | null } | File): boolean {
  const type = ((f as { type?: string | null }).type ?? '').toLowerCase()
  const name = ((f as { name?: string | null }).name ?? '')
  if (type.startsWith('image/')) return true
  if (!type && IMG_EXT.test(name)) return true   // iOS Safari con MIME vacío
  return false
}

/** Mismos criterios que isImageFile pero usable en el request Form (server-side). */
export function isImageByTypeOrName(type: string | null | undefined, name: string | null | undefined): boolean {
  return isImageFile({ type: type ?? undefined, name: name ?? undefined })
}
