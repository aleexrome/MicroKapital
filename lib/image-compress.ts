/**
 * Comprime una imagen en el cliente ANTES de subirla al server.
 *
 * Problema que resuelve: Vercel Serverless limita los bodies a 4.5MB
 * (ni la Pro plan sube ese límite para rutas). Las fotos de iPhone 11+
 * pesan 3-8MB en HEIC y hasta 10MB en JPG — la mayoría eran rechazadas
 * ANTES de llegar al handler y el usuario solo veía "no se pudo subir".
 *
 * Estrategia: dibujar la imagen en un <canvas> con un ancho máximo de
 * 1600px y exportarla como JPG con calidad 0.82. Resultado típico:
 * 300-900KB — cabe de sobra en el límite. La legibilidad del
 * comprobante no se pierde porque un screenshot de app bancaria rara
 * vez excede 1080px de ancho real.
 *
 * Browser nativo decodifica HEIC/JPG/PNG/WEBP en Safari iOS 14+ y
 * Chrome/Edge actuales, así que no necesitamos librería adicional para
 * el input.
 */
export async function compressImage(
  file: File,
  opts: { maxWidth?: number; quality?: number } = {},
): Promise<File> {
  const maxWidth = opts.maxWidth ?? 1600
  const quality  = opts.quality  ?? 0.82

  // Si ya pesa menos del threshold, no tocar (evita recomprimir JPG).
  if (file.size < 1_200_000 && file.type.startsWith('image/jpeg')) return file

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('No se pudo leer la foto'))
    reader.readAsDataURL(file)
  })

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload  = () => resolve(el)
    el.onerror = () => reject(new Error('El formato de la foto no se puede procesar'))
    el.src = dataUrl
  })

  const ratio    = img.naturalWidth > maxWidth ? maxWidth / img.naturalWidth : 1
  const w = Math.round(img.naturalWidth  * ratio)
  const h = Math.round(img.naturalHeight * ratio)

  const canvas = document.createElement('canvas')
  canvas.width  = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('El navegador no permite redimensionar la foto')
  ctx.drawImage(img, 0, 0, w, h)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  )
  if (!blob) throw new Error('No se pudo comprimir la foto')

  // Nombre final: mismo stem, extensión .jpg porque cambiamos el formato.
  const stem = file.name.replace(/\.[^.]+$/, '') || 'foto'
  return new File([blob], `${stem}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
}
