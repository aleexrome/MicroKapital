'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Camera, Loader2, MapPin, X, CheckCircle, Image as ImageIcon } from 'lucide-react'
import exifr from 'exifr'

interface CapturarFotoDesembolsoDialogProps {
  loanId: string
  open: boolean
  onClose: () => void
}

type GpsSource = 'EXIF' | 'LIVE'

/**
 * Modal del candado 3 del flujo de activación. Acepta foto desde la cámara
 * (en tiempo real) o desde la galería (con GPS de los metadatos EXIF, para
 * lugares sin señal donde la cámara con GPS en vivo no es viable).
 *
 * Al subirla, /api/loans/[id]/disbursement-photo activa el préstamo
 * (IN_ACTIVATION → ACTIVE) y genera el calendario de pagos en una sola
 * transacción.
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
  const [gpsSource, setGpsSource] = useState<GpsSource | null>(null)
  const [gettingLocation, setGettingLocation] = useState(false)
  /** Modo de captura: si fue cámara directa intentamos GPS en vivo; si fue
   *  galería intentamos sólo el EXIF para no pedir el GPS de donde se
   *  está activando el préstamo (que sería incorrecto). */
  const [captureMode, setCaptureMode] = useState<'camera' | 'gallery' | null>(null)

  if (!open) return null

  function requestLocation() {
    if (!navigator.geolocation) {
      toast({
        title: 'GPS no disponible',
        description: 'El navegador no permite obtener ubicación. Activa los permisos de ubicación o sube una foto con GPS desde la galería.',
        variant: 'destructive',
      })
      return
    }
    setGettingLocation(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGpsSource('LIVE')
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

  /** Lee los metadatos EXIF de la foto. Devuelve null si no hay GPS. */
  async function extractGpsFromExif(file: File): Promise<{ lat: number; lng: number } | null> {
    try {
      const gps = await exifr.gps(file)
      if (!gps || typeof gps.latitude !== 'number' || typeof gps.longitude !== 'number') {
        return null
      }
      return { lat: gps.latitude, lng: gps.longitude }
    } catch {
      return null
    }
  }

  async function handleFileFromCamera(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCaptureMode('camera')
    setSelectedFile(file)
    setGpsSource(null)
    setLocation(null)
    const reader = new FileReader()
    reader.onload = (ev) => setPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
    // Cámara → GPS en vivo (la foto recién tomada lo refleja).
    requestLocation()
  }

  async function handleFileFromGallery(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCaptureMode('gallery')
    setSelectedFile(file)
    setGpsSource(null)
    setLocation(null)
    setGettingLocation(true)
    const reader = new FileReader()
    reader.onload = (ev) => setPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
    // Galería → leer EXIF.
    const exifGps = await extractGpsFromExif(file)
    setGettingLocation(false)
    if (exifGps) {
      setLocation(exifGps)
      setGpsSource('EXIF')
    } else {
      toast({
        title: 'La foto no tiene GPS en sus metadatos',
        description: 'Usa una foto tomada con el GPS activado (Configuración → Cámara → Ubicación) o toma una nueva desde la cámara.',
        variant: 'destructive',
      })
    }
  }

  async function handleUpload() {
    if (!selectedFile) return
    if (!location) {
      toast({
        title: 'Falta ubicación GPS',
        description: 'Necesitamos las coordenadas para registrar el desembolso.',
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
      if (gpsSource) fd.append('gpsSource', gpsSource)

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

  function reset() {
    setPreview(null)
    setSelectedFile(null)
    setLocation(null)
    setGpsSource(null)
    setCaptureMode(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleClose() {
    if (uploading) return
    reset()
    onClose()
  }

  // Inputs ocultos — los disparan los botones visibles
  function pickCamera() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.setAttribute('capture', 'environment')
    input.onchange = (ev) => handleFileFromCamera({ target: ev.target } as unknown as React.ChangeEvent<HTMLInputElement>)
    input.click()
  }

  function pickGallery() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = (ev) => handleFileFromGallery({ target: ev.target } as unknown as React.ChangeEvent<HTMLInputElement>)
    input.click()
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
          Toma una foto del cliente recibiendo el dinero. Si no hay señal, sube una foto desde la galería —
          se usará el GPS guardado en los metadatos de la imagen. Al subirla el préstamo se activa.
        </p>

        {/* Botones de elegir origen — sólo si no hay archivo todavía */}
        {!selectedFile && (
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={pickCamera}
              disabled={uploading}
              className="flex flex-col items-center justify-center gap-1 py-6 border-dashed h-auto"
            >
              <Camera className="h-5 w-5" />
              <span className="text-xs">Cámara</span>
              <span className="text-[10px] text-muted-foreground">GPS en vivo</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={pickGallery}
              disabled={uploading}
              className="flex flex-col items-center justify-center gap-1 py-6 border-dashed h-auto"
            >
              <ImageIcon className="h-5 w-5" />
              <span className="text-xs">Galería</span>
              <span className="text-[10px] text-muted-foreground">GPS de la foto</span>
            </Button>
          </div>
        )}

        {/* Preview + GPS */}
        {preview && (
          <>
            <div className="rounded-xl overflow-hidden border border-border/60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Preview" className="w-full max-h-64 object-cover" />
            </div>

            <div className="rounded-lg bg-secondary/40 border border-border/60 px-3 py-2 text-sm flex items-center gap-2">
              {gettingLocation ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-primary-400" />
                  <span>{captureMode === 'gallery' ? 'Leyendo GPS de los metadatos…' : 'Obteniendo GPS en vivo…'}</span>
                </>
              ) : location ? (
                <>
                  <MapPin className="h-4 w-4 text-emerald-500" />
                  <span className="text-xs font-mono">
                    {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                  </span>
                  <span className="text-[10px] ml-auto text-muted-foreground">
                    {gpsSource === 'EXIF' ? 'de la foto' : 'en vivo'}
                  </span>
                </>
              ) : (
                <>
                  <MapPin className="h-4 w-4 text-amber-500" />
                  {captureMode === 'gallery' ? (
                    <span className="text-xs">Esta foto no tiene GPS. Elige otra o usa la cámara.</span>
                  ) : (
                    <Button size="sm" variant="outline" onClick={requestLocation}>
                      Reintentar GPS
                    </Button>
                  )}
                </>
              )}
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={reset}
              disabled={uploading}
              className="w-full justify-center text-xs"
            >
              Elegir otra foto
            </Button>
          </>
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
