'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Upload, X } from 'lucide-react'

const ACCEPTED_MIME = 'application/pdf,image/jpeg,image/png'
const MAX_BYTES = 10 * 1024 * 1024

interface SubirContratoFirmadoDialogProps {
  contractId: string
  open: boolean
  onClose: () => void
}

/**
 * Modal para subir el contrato firmado por el cliente. Acepta PDF/JPG/PNG
 * hasta 10MB. Al subir exitosamente, refresca la página para que se
 * actualicen los candados de activación y el botón cambie de estado.
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  if (!open) return null

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    if (!f) {
      setSelectedFile(null)
      return
    }
    if (f.size > MAX_BYTES) {
      toast({
        title: 'Archivo demasiado grande',
        description: 'Tamaño máximo: 10MB',
        variant: 'destructive',
      })
      e.target.value = ''
      setSelectedFile(null)
      return
    }
    setSelectedFile(f)
  }

  async function handleUpload() {
    if (!selectedFile) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', selectedFile)
      const res = await fetch(`/api/contracts/${contractId}/upload-signed`, {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(typeof body.error === 'string' ? body.error : 'Error al subir')
      }
      toast({ title: 'Contrato firmado subido' })
      setSelectedFile(null)
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
    setSelectedFile(null)
    if (fileRef.current) fileRef.current.value = ''
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-card border border-border/60 shadow-card p-5 space-y-4"
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
          Sube el contrato escaneado o foto de cada página firmada por el cliente.
          Tamaño máximo: 10MB.
        </p>

        <div>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_MIME}
            onChange={handleFileChange}
            disabled={uploading}
            className="block w-full text-sm text-foreground file:mr-3 file:rounded-xl file:border-0 file:bg-primary-500 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-primary-400 disabled:opacity-50"
          />
          {selectedFile && (
            <p className="mt-2 text-xs text-muted-foreground">
              {selectedFile.name} · {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={uploading}>
            Cancelar
          </Button>
          <Button onClick={handleUpload} disabled={!selectedFile || uploading}>
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
