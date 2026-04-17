'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { Camera, Loader2, MapPin, CheckCircle, Image, Eye } from 'lucide-react'

interface DisbursementPhotoProps {
  loanId: string
  fotoUrl: string | null
  lat: number | null
  lng: number | null
  fotoAt: string | null
  readOnly?: boolean
}

export function DisbursementPhoto({
  loanId,
  fotoUrl,
  lat,
  lng,
  fotoAt,
  readOnly = false,
}: DisbursementPhotoProps) {
  const router = useRouter()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [gettingLocation, setGettingLocation] = useState(false)
  const [showViewer, setShowViewer] = useState(false)

  useEffect(() => {
    if (lat && lng) setLocation({ lat, lng })
  }, [lat, lng])

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)

    const reader = new FileReader()
    reader.onload = (ev) => setPreview(ev.target?.result as string)
    reader.readAsDataURL(file)

    requestLocation()
  }

  function requestLocation() {
    if (!navigator.geolocation) return
    setGettingLocation(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGettingLocation(false)
      },
      () => {
        setGettingLocation(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  async function handleUpload() {
    if (!selectedFile) return
    setUploading(true)

    try {
      const formData = new FormData()
      formData.append('foto', selectedFile)
      if (location) {
        formData.append('lat', location.lat.toString())
        formData.append('lng', location.lng.toString())
      }

      const res = await fetch(`/api/loans/${loanId}/disbursement-photo`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Error al subir foto')
      }

      toast({ title: 'Foto de desembolso registrada', description: 'El calendario de pagos ya esta disponible.' })
      setSelectedFile(null)
      setPreview(null)
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

  // Already uploaded — show photo with view button
  if (fotoUrl) {
    return (
      <>
        <Card className="border-green-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm font-medium">Evidencia de desembolso</span>
              </div>
              <div className="flex items-center gap-2">
                {lat && lng && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {lat.toFixed(4)}, {lng.toFixed(4)}
                  </span>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowViewer(true)}
                >
                  <Eye className="h-4 w-4 mr-1" /> Ver foto
                </Button>
              </div>
            </div>
            {fotoAt && (
              <p className="text-xs text-muted-foreground mt-1">
                Registrada: {new Date(fotoAt).toLocaleString('es-MX')}
              </p>
            )}
          </CardContent>
        </Card>

        {showViewer && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={() => setShowViewer(false)}
          >
            <div className="relative max-w-3xl max-h-[90vh] w-full" onClick={(e) => e.stopPropagation()}>
              <img
                src={fotoUrl}
                alt="Foto de desembolso"
                className="w-full h-auto rounded-lg object-contain max-h-[85vh]"
              />
              <div className="absolute top-2 right-2">
                <Button size="sm" variant="outline" className="bg-black/50 text-white border-white/30" onClick={() => setShowViewer(false)}>
                  Cerrar
                </Button>
              </div>
              {lat && lng && (
                <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {lat.toFixed(6)}, {lng.toFixed(6)}
                </div>
              )}
            </div>
          </div>
        )}
      </>
    )
  }

  // Read-only but no photo (e.g. Director viewing)
  if (readOnly) return null

  // Upload form
  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-amber-400 flex items-center gap-2">
          <Camera className="h-4 w-4" />
          Foto de desembolso requerida
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Sube una foto del cliente recibiendo el dinero. El calendario de pagos se desbloqueara al registrar la evidencia.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileSelect}
        />

        {!preview ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.setAttribute('capture', 'environment')
                  fileInputRef.current.click()
                }
              }}
            >
              <Camera className="h-4 w-4 mr-1" /> Tomar foto
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.removeAttribute('capture')
                  fileInputRef.current.click()
                }
              }}
            >
              <Image className="h-4 w-4 mr-1" /> Galeria
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <img
              src={preview}
              alt="Vista previa"
              className="w-full max-h-64 object-contain rounded-lg border border-gray-700"
            />

            <div className="flex items-center gap-2 text-sm">
              {gettingLocation ? (
                <span className="text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Obteniendo ubicacion...
                </span>
              ) : location ? (
                <span className="text-green-400 flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={requestLocation}
                  className="text-amber-400 flex items-center gap-1 hover:underline text-xs"
                >
                  <MapPin className="h-3 w-3" /> Activar ubicacion
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={uploading}
                onClick={() => { setPreview(null); setSelectedFile(null) }}
              >
                Cambiar foto
              </Button>
              <Button
                className="flex-1"
                disabled={uploading}
                onClick={handleUpload}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <><Camera className="h-4 w-4 mr-1" /> Registrar evidencia</>
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
