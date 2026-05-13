'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Upload, X, Trash2, Plus, Image as ImageIcon } from 'lucide-react'

// `accept` lo dejamos amplio para que en celulares aparezca cámara + galería
// + archivos. La validación real de tipo la hace el backend (por extensión)
// porque algunos teléfonos reportan PDF como `application/octet-stream` y
// con `accept` estricto el archivo ni siquiera se podía seleccionar.
const ACCEPTED_MIME = 'application/pdf,image/*'
// El límite por archivo individual; el total puede ser más alto al combinar
// múltiples fotos. El backend valida ambos.
const MAX_BYTES_PER_FILE = 10 * 1024 * 1024  // 10MB
const MAX_BYTES_TOTAL = 25 * 1024 * 1024     // 25MB total combinado

interface SubirContratoFirmadoDialogProps {
  contractId: string
  open: boolean
  onClose: () => void
}

/**
 * Modal para subir el contrato firmado por el cliente. Acepta:
 *  - Un PDF (tipo escaneo).
 *  - Una o varias fotos (JPG/PNG/HEIC) — el backend las combina en un PDF.
 */
export function SubirContratoFirmadoDialog({
  contractId,
  open,
  onClose,
}: SubirContratoFirmadoDialogProps) {
  const router = useRouter()
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [files, setFiles] = useState<File[]>([])

  if (!open) return null

  function isImage(f: File) {
    return f.type.startsWith('image/') || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name)
  }

  function isPdf(f: File) {
    return f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const nuevos = Array.from(e.target.files ?? [])
    // Validar uno por uno y acumular con los ya seleccionados (al re-tocar
    // el input se pueden ir agregando, no reemplazar).
    const aceptados: File[] = [...files]
    for (const f of nuevos) {
      if (f.size > MAX_BYTES_PER_FILE) {
        toast({
          title: `"${f.name}" pesa más de 10MB`,
          description: 'Reduce la calidad de la foto o usa un archivo más chico.',
          variant: 'destructive',
        })
        continue
      }
      if (!isImage(f) && !isPdf(f)) {
        toast({
          title: `"${f.name}" no es un formato permitido`,
          description: 'Usa fotos (JPG/PNG/HEIC) o PDF.',
          variant: 'destructive',
        })
        continue
      }
      aceptados.push(f)
    }
    // No mezclar PDFs con imágenes: el backend espera o un PDF, o un
    // conjunto de imágenes a combinar. Si hay PDF + imagen mostramos error.
    const hayPdf = aceptados.some(isPdf)
    const hayImg = aceptados.some(isImage)
    if (hayPdf && hayImg) {
      toast({
        title: 'No mezcles PDF con fotos',
        description: 'Sube todas las páginas como fotos, o sube un solo PDF.',
        variant: 'destructive',
      })
      e.target.value = ''
      return
    }
    if (hayPdf && aceptados.filter(isPdf).length > 1) {
      toast({
        title: 'Sólo se permite un PDF',
        description: 'Si el contrato tiene varias páginas, subelo como un único PDF combinado.',
        variant: 'destructive',
      })
      e.target.value = ''
      return
    }
    const tamTotal = aceptados.reduce((s, f) => s + f.size, 0)
    if (tamTotal > MAX_BYTES_TOTAL) {
      toast({
        title: 'Las fotos suman más de 25MB',
        description: 'Reduce la calidad o sube menos páginas.',
        variant: 'destructive',
      })
      return
    }
    setFiles(aceptados)
    // Limpiar el input para permitir re-seleccionar el mismo archivo si hace falta
    e.target.value = ''
  }

  function quitarArchivo(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleUpload() {
    if (files.length === 0) return
    setUploading(true)
    try {
      const fd = new FormData()
      // Mantener el nombre `file` para compatibilidad con el endpoint viejo.
      // El backend usa `formData.getAll('file')` para recibir múltiples.
      for (const f of files) fd.append('file', f)
      const res = await fetch(`/api/contracts/${contractId}/upload-signed`, {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(typeof body.error === 'string' ? body.error : 'Error al subir')
      }
      toast({ title: 'Contrato firmado subido' })
      setFiles([])
      if (fileRef.current) fileRef.current.value = ''
      onClose()
      router.refresh()
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Error al subir',
        variant: 'destructive',
      })
    } finally {
      setUploading(false)
    }
  }

  function handleClose() {
    if (uploading) return
    setFiles([])
    if (fileRef.current) fileRef.current.value = ''
    onClose()
  }

  const tamTotalMb = files.reduce((s, f) => s + f.size, 0) / 1024 / 1024
  const hayImagenes = files.length > 0 && files.every(isImage)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-card border border-border/60 shadow-card p-5 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h3 className="text-base font-semibold">Subir contrato firmado</h3>
          <button
            onClick={handleClose}
            disabled={uploading}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground">
          Sube el contrato escaneado en PDF, <strong>o varias fotos</strong> (una por página) y se combinan automáticamente. Cada archivo máx. 10MB, total máx. 25MB.
        </p>

        <div>
          {/* Input nativo oculto; abrimos el selector con un botón visible. */}
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_MIME}
            multiple
            onChange={handleFileChange}
            disabled={uploading}
            className="sr-only"
          />

          {/* Botón principal: si no hay archivos, abre el selector. Si ya
              hay, sirve como "+ Agregar más fotos". */}
          {files.length === 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full justify-center py-6 border-dashed"
            >
              <ImageIcon className="h-4 w-4 mr-2" />
              Seleccionar PDF o fotos
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full justify-center border-dashed"
            >
              <Plus className="h-4 w-4 mr-2" />
              Agregar más fotos
            </Button>
          )}

          {files.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <p className="text-xs text-muted-foreground">
                {files.length} archivo{files.length !== 1 ? 's' : ''} · {tamTotalMb.toFixed(2)} MB total
                {hayImagenes && files.length > 1 && ' · se combinarán en un PDF'}
              </p>
              <ul className="space-y-1">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs"
                  >
                    <span className="truncate flex-1">
                      <span className="text-muted-foreground mr-1.5">{i + 1}.</span>
                      {f.name}
                    </span>
                    <span className="text-muted-foreground tabular-nums shrink-0">
                      {(f.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                    <button
                      onClick={() => quitarArchivo(i)}
                      disabled={uploading}
                      className="text-red-500 hover:text-red-400 disabled:opacity-50"
                      aria-label="Quitar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={uploading}>
            Cancelar
          </Button>
          <Button onClick={handleUpload} disabled={files.length === 0 || uploading}>
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Subiendo…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Subir
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
