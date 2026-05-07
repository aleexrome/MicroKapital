'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Camera, Loader2, MapPin, X, CheckCircle } from 'lucide-react'

interface CapturarFotoDesembolsoDialogProps {
  loanId: string
  open: boolean
  onClose: () => void
}

/**
 * Modal del candado 3 del flujo de activación. Captura foto + ubicación
 * GPS y la envía a /api/loans/[id]/disbursement-photo. Ese endpoint, en
 * Fase 6, también activa el préstamo (IN_ACTIVATION → ACTIVE) y genera
 * el calendario de pagos en una sola transacción.
 */
export function CapturarFotoDesembolsoDialog({
  loanId,
  open,
  onClose,
}: CapturarFotoDesembolsoDialogProps) {
  const router = useRouter()
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [gettingLocation, setGettingLocation] = useState(false)

  if (!open) return null

  function requestLocation() {
    if (!navigator.geolocation) {
      toast({
        title: 'GPS no disponible',
        description: 'El navegador no permite obtener ubicación. Activa los permisos de ubicación.',
        variant: 'destructive',
      })
      return
    }
    setGettingLocation(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGettingLocation(false)
      },
      (err) => {
        setGettingLocation(false)
        toast({
          title: 'No se pudo obtener la ubicación',
          description: err.message ?? 'Verifica los permisos de GPS del navegador.',
          variant: 'destructive',
        })
      },
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
    requestLocation()
  }

  async function handleUpload() {
    if (!selectedFile) return
    if (!location) {
      toast({
        title: 'Falta ubicación GPS',
        description: 'Necesitamos las coordenadas para registrar el desembolso. Toca "Reintentar GPS".',
        variant: 'destructive',
      })
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('foto', selectedFile)
      fd.append('lat', location.lat.toString())
      fd.append('lng', location.lng.toString())

      const res = await fetch(`/api/loans/${loanId}/disbursement-photo`, {
        method: 'POST',
        body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Error al subir foto')

      toast({
        title: 'Préstamo activado',
        description: 'La foto del desembolso se registró y el calendario de pagos quedó generado.',
      })
      onClose()
      router.refresh()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'No se pudo subir la foto',
        variant: 'destructive',
      })
    } finally {
      setUploading(false)
    }
  }

  function handleClose() {
    if (uploading) return
    setPreview(null)
    setSelectedFile(null)
    setLocation(null)
    if (fileRef.current) fileRef.current.value = ''
    onClose()
  }

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
          <div className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary-400" />
            <h3 className="text-base font-semibold">Foto del desembolso</h3>
          </div>
          <button
            onClick={handleClose}
            disabled={uploading}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground">
          Toma una foto del cliente recibiendo el dinero. Al subirla, el préstamo
          se activará automáticamente y se generará el calendario de pagos.
        </p>

        {/* Captura */}
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
            disabled={uploading}
            className="block w-full text-sm text-foreground file:mr-3 file:rounded-xl file:border-0 file:bg-primary-500 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-primary-400 disabled:opacity-50"
          />
        </div>

        {/* Preview */}
        {preview && (
          <div className="rounded-xl overflow-hidden border border-border/60">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Preview" className="w-full max-h-64 object-cover" />
          </div>
        )}

        {/* Ubicación GPS */}
        {selectedFile && (
          <div className="rounded-lg bg-secondary/40 border border-border/60 px-3 py-2 text-sm flex items-center gap-2">
            {gettingLocation ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-primary-400" />
                <span>Obteniendo GPS…</span>
              </>
            ) : location ? (
              <>
                <MapPin className="h-4 w-4 text-emerald-500" />
                <span className="text-xs font-mono">
                  {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                </span>
              </>
            ) : (
              <>
                <MapPin className="h-4 w-4 text-amber-500" />
                <Button size="sm" variant="outline" onClick={requestLocation}>
                  Reintentar GPS
                </Button>
              </>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={uploading}>
            Cancelar
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!selectedFile || !location || uploading}
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Subiendo…
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" />
                Activar préstamo
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
