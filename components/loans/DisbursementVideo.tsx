'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import {
  Video, Loader2, MapPin, CheckCircle, AlertTriangle, RefreshCw, X,
  Play, Square, PlayCircle, Info,
} from 'lucide-react'

interface DisbursementVideoProps {
  loanId: string
  /** Si el préstamo YA tiene video aprobado, se muestra en modo view. */
  videoUrl: string | null
  fotoUrl: string | null   // fallback legacy si solo hay foto
  lat: number | null
  lng: number | null
  videoAt: string | null   // desembolsoVideoSubidoAt ISO
  fotoAt: string | null
  /** Si es DG/DC/MC/SUPER_ADMIN o dueños no autorizados, se ve solo. */
  readOnly?: boolean
  /** Estado del loan — solo IN_ACTIVATION o ACTIVE (legacy sin video) permiten grabar. */
  estadoLoan: string
}

type Fase = 'idle' | 'preparando' | 'grabando' | 'preview' | 'subiendo' | 'rechazado'

interface SesionDesembolso {
  palabraDelDia: string
  guion: string
  expiraEnMs: number
  iniciadaAt: string
  prestamo: { clienteNombre: string; capital: number }
}

interface ValidacionCheck {
  ok: boolean
  detalle: string
}

interface ValidacionResp {
  aprobado: boolean
  videoUrl: string
  validacion: {
    checks: {
      nombre: ValidacionCheck
      fecha: ValidacionCheck
      monto: ValidacionCheck
      palabraDelDia: ValidacionCheck
      dineroVisible: ValidacionCheck
    }
  }
  razones?: string[]
  message?: string
}

const MAX_DURACION_SEG = 25  // max 25s de grabación para que Whisper sea rápido

export function DisbursementVideo({
  loanId,
  videoUrl,
  fotoUrl,
  lat,
  lng,
  videoAt,
  fotoAt,
  readOnly = false,
  estadoLoan,
}: DisbursementVideoProps) {
  const router = useRouter()
  const { toast } = useToast()

  const [fase, setFase] = useState<Fase>('idle')
  const [sesion, setSesion] = useState<SesionDesembolso | null>(null)
  const [tiempoRestanteSesion, setTiempoRestanteSesion] = useState(0)   // ms
  const [duracionGrabacion, setDuracionGrabacion] = useState(0)         // s
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [rechazo, setRechazo] = useState<ValidacionResp | null>(null)

  const streamRef       = useRef<MediaStream | null>(null)
  const recorderRef     = useRef<MediaRecorder | null>(null)
  const chunksRef       = useRef<Blob[]>([])
  const videoElRef      = useRef<HTMLVideoElement | null>(null)
  const grabacionTickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Countdown de sesión (5 min). Empieza cuando `sesion` se setea.
  useEffect(() => {
    if (!sesion) { setTiempoRestanteSesion(0); return }
    const iniciada = new Date(sesion.iniciadaAt).getTime()
    const iv = setInterval(() => {
      const restante = Math.max(0, iniciada + sesion.expiraEnMs - Date.now())
      setTiempoRestanteSesion(restante)
      if (restante === 0) clearInterval(iv)
    }, 500)
    return () => clearInterval(iv)
  }, [sesion])

  // Limpia stream/preview al desmontar
  useEffect(() => () => cleanupStream(), [])

  function cleanupStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    if (grabacionTickRef.current) clearInterval(grabacionTickRef.current)
  }

  // ── VIEW: ya hay video aprobado ─────────────────────────────────────
  if (videoUrl) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Video className="h-4 w-4 text-primary-600" />
            Evidencia de desembolso (video)
            <span className="ml-auto flex items-center gap-1 text-xs text-emerald-600 font-normal">
              <CheckCircle className="h-3.5 w-3.5" />
              Verificado automáticamente
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <video
            src={videoUrl}
            controls
            playsInline
            className="w-full rounded-lg bg-black max-h-96"
          />
          <div className="text-xs text-muted-foreground flex items-center gap-4 flex-wrap">
            {videoAt && <span>Grabado: {new Date(videoAt).toLocaleString('es-MX')}</span>}
            {lat !== null && lng !== null && (
              <a
                href={`https://www.google.com/maps?q=${lat},${lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:underline text-primary-600"
              >
                <MapPin className="h-3 w-3" />
                Ver ubicación
              </a>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  // ── VIEW: solo hay foto (legacy) ───────────────────────────────────
  if (fotoUrl && !videoUrl) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <PlayCircle className="h-4 w-4 text-primary-600" />
            Evidencia de desembolso (foto — sistema anterior)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <img src={fotoUrl} alt="Foto de desembolso" className="w-full rounded-lg max-h-96 object-contain bg-black/5" />
          <p className="text-[11px] text-muted-foreground flex items-start gap-1">
            <Info className="h-3 w-3 mt-0.5 shrink-0" />
            Este crédito se activó con el sistema anterior de foto. Los créditos nuevos usan video con validación automática.
          </p>
          <div className="text-xs text-muted-foreground flex items-center gap-4 flex-wrap">
            {fotoAt && <span>Foto: {new Date(fotoAt).toLocaleString('es-MX')}</span>}
            {lat !== null && lng !== null && (
              <a
                href={`https://www.google.com/maps?q=${lat},${lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:underline text-primary-600"
              >
                <MapPin className="h-3 w-3" />
                Ver ubicación
              </a>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  // ── Sin evidencia ──────────────────────────────────────────────────
  // Read-only + sin evidencia → nada.
  if (readOnly) return null

  // Solo permitir grabar si loan está en un estado apto.
  const estadoApto = estadoLoan === 'IN_ACTIVATION' || estadoLoan === 'ACTIVE'
  if (!estadoApto) return null

  // ── Handlers ────────────────────────────────────────────────────────
  async function iniciarSesion() {
    setRechazo(null)
    setFase('preparando')
    try {
      // 1. Pedir permisos (cámara + micrófono + GPS) primero. Si el
      //    usuario niega alguno, no gastamos una sesión en el server.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, // cámara trasera en móvil
        audio: true,
      })
      streamRef.current = stream

      const coords = await new Promise<GeolocationPosition | null>((res) => {
        if (!navigator.geolocation) return res(null)
        navigator.geolocation.getCurrentPosition(
          (p) => res(p),
          () => res(null),
          { enableHighAccuracy: true, timeout: 10000 },
        )
      })
      if (coords) setGpsCoords({ lat: coords.coords.latitude, lng: coords.coords.longitude })

      // 2. Iniciar sesión en el server
      const r = await fetch(`/api/loans/${loanId}/desembolso/iniciar-sesion`, { method: 'POST' })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'No se pudo iniciar sesión')
      setSesion(data as SesionDesembolso)

      // 3. Enganchar el stream al <video> preview y arrancar MediaRecorder.
      if (videoElRef.current) {
        videoElRef.current.srcObject = stream
        videoElRef.current.muted = true
        await videoElRef.current.play().catch(() => {})
      }
      arrancarGrabacion(stream)
    } catch (err) {
      cleanupStream()
      setFase('idle')
      toast({
        title: 'No se pudo acceder a la cámara',
        description: err instanceof Error ? err.message : 'Concede permisos de cámara, micrófono y ubicación.',
        variant: 'destructive',
      })
    }
  }

  function arrancarGrabacion(stream: MediaStream) {
    chunksRef.current = []
    setDuracionGrabacion(0)

    // Elegir mime type compatible con el navegador; Safari iOS necesita mp4.
    const mimeTypes = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
    const mime = mimeTypes.find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onstop = () => {
      const type = recorder.mimeType || 'video/webm'
      const blob = new Blob(chunksRef.current, { type })
      setVideoBlob(blob)
      const url = URL.createObjectURL(blob)
      setPreviewUrl(url)
      // Cortar el stream — ya se puede liberar la cámara.
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      setFase('preview')
    }
    recorderRef.current = recorder
    recorder.start()
    setFase('grabando')

    // Timer para mostrar duración + auto-stop a los 25s.
    grabacionTickRef.current = setInterval(() => {
      setDuracionGrabacion((prev) => {
        const next = prev + 1
        if (next >= MAX_DURACION_SEG) {
          detenerGrabacion()
        }
        return next
      })
    }, 1000)
  }

  function detenerGrabacion() {
    if (grabacionTickRef.current) {
      clearInterval(grabacionTickRef.current)
      grabacionTickRef.current = null
    }
    recorderRef.current?.stop()
  }

  function descartarPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setVideoBlob(null)
    setSesion(null)
    setFase('idle')
  }

  async function subir() {
    if (!videoBlob) return
    setFase('subiendo')
    try {
      const fd = new FormData()
      const ext = videoBlob.type.includes('mp4') ? 'mp4' : 'webm'
      fd.append('video', new File([videoBlob], `desembolso-${loanId}.${ext}`, { type: videoBlob.type }))
      if (gpsCoords) {
        fd.append('lat', String(gpsCoords.lat))
        fd.append('lng', String(gpsCoords.lng))
      }
      const r = await fetch(`/api/loans/${loanId}/desembolso/upload`, { method: 'POST', body: fd })
      const data: ValidacionResp & { error?: string } = await r.json()
      if (!r.ok && !data?.validacion) {
        throw new Error(data?.error ?? 'Error al subir el video')
      }

      if (data.aprobado) {
        toast({
          title: '✅ Desembolso aprobado',
          description: 'El préstamo quedó activo. Se generó el calendario de pagos.',
        })
        cleanupStream()
        router.refresh()
      } else {
        setRechazo(data)
        setFase('rechazado')
      }
    } catch (err) {
      toast({
        title: 'Error al subir el video',
        description: err instanceof Error ? err.message : 'Revisa tu conexión y reintenta.',
        variant: 'destructive',
      })
      setFase('preview') // vuelve al preview para reintentar upload
    }
  }

  const mmSs = (ms: number) => {
    const total = Math.ceil(ms / 1000)
    const m = Math.floor(total / 60)
    const s = total % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  // ── RENDER ─────────────────────────────────────────────────────────
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Video className="h-4 w-4 text-primary-600" />
          Video de desembolso
          <span className="text-xs font-normal text-muted-foreground">
            (evidencia con validación automática)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        {fase === 'idle' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              El cliente va a grabar un video corto diciendo su nombre, la fecha, el monto y una palabra
              del día que se genera al iniciar. El sistema valida todo automáticamente antes de activar el préstamo.
            </p>
            <Button onClick={iniciarSesion} size="lg">
              <Video className="h-4 w-4 mr-2" />
              Iniciar grabación
            </Button>
            <p className="text-[11px] text-muted-foreground flex items-start gap-1">
              <Info className="h-3 w-3 mt-0.5 shrink-0" />
              Se van a pedir permisos de cámara, micrófono y ubicación. Concédelos todos.
            </p>
          </div>
        )}

        {fase === 'preparando' && (
          <div className="flex items-center gap-2 py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Preparando cámara y generando palabra del día...</span>
          </div>
        )}

        {(fase === 'grabando' || (fase === 'preview' && sesion)) && sesion && (
          <div className="space-y-3">
            {/* Guion + palabra del día */}
            <div className="rounded-xl bg-primary-50 border border-primary-200 p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-primary-700">
                  Guion — que el cliente diga esto:
                </p>
                <span className="text-xs text-primary-700 font-mono">
                  Sesión: {mmSs(tiempoRestanteSesion)}
                </span>
              </div>
              <p className="text-sm text-primary-900 leading-relaxed">"{sesion.guion}"</p>
              <div className="mt-2 pt-2 border-t border-primary-200 flex items-center justify-between">
                <span className="text-xs text-primary-700">Palabra del día:</span>
                <span className="font-mono text-base font-bold text-primary-900 tracking-wider">
                  {sesion.palabraDelDia}
                </span>
              </div>
            </div>

            {/* Video preview / grabación en vivo */}
            <div className="relative">
              <video
                ref={videoElRef}
                autoPlay
                playsInline
                muted={fase === 'grabando'}
                controls={fase === 'preview'}
                src={fase === 'preview' && previewUrl ? previewUrl : undefined}
                className="w-full rounded-lg bg-black max-h-96"
              />
              {fase === 'grabando' && (
                <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full animate-pulse">
                  <span className="h-1.5 w-1.5 bg-white rounded-full" />
                  REC {duracionGrabacion}s / {MAX_DURACION_SEG}s
                </div>
              )}
            </div>

            {fase === 'grabando' && (
              <div className="flex gap-2">
                <Button onClick={detenerGrabacion} variant="destructive" size="lg" className="flex-1">
                  <Square className="h-4 w-4 mr-2" />
                  Detener grabación
                </Button>
              </div>
            )}
            {fase === 'preview' && (
              <div className="flex gap-2 flex-wrap">
                <Button onClick={subir} size="lg" className="flex-1">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Enviar para validar
                </Button>
                <Button onClick={descartarPreview} variant="outline" size="lg">
                  <X className="h-4 w-4 mr-2" />
                  Descartar y regrabar
                </Button>
              </div>
            )}
          </div>
        )}

        {fase === 'subiendo' && (
          <div className="flex items-center gap-2 py-6 justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
            <div>
              <p className="text-sm font-medium">Subiendo y validando video...</p>
              <p className="text-xs text-muted-foreground">Whisper transcribe el audio y Claude Vision revisa los frames. Puede tardar 15-30 segundos.</p>
            </div>
          </div>
        )}

        {fase === 'rechazado' && rechazo && (
          <div className="space-y-3">
            <div className="rounded-xl bg-red-50 border border-red-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <p className="font-semibold text-red-900">Video rechazado — algunos checks no pasaron</p>
              </div>
              <ul className="space-y-1 text-sm text-red-800 mt-2">
                {rechazo.razones?.map((r, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-red-500 mt-0.5">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Detalle de cada check */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Object.entries(rechazo.validacion.checks).map(([nombre, check]) => (
                <div
                  key={nombre}
                  className={`text-xs p-2 rounded border ${
                    check.ok
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-red-50 border-red-200 text-red-900'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {check.ok
                      ? <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                      : <X className="h-3.5 w-3.5 shrink-0" />}
                    <span className="font-semibold capitalize">{nombre}</span>
                  </div>
                  <p className="mt-1 text-[11px]">{check.detalle}</p>
                </div>
              ))}
            </div>

            <Button onClick={() => { setRechazo(null); iniciarSesion() }} size="lg" className="w-full">
              <RefreshCw className="h-4 w-4 mr-2" />
              Regrabar con palabra del día nueva
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
