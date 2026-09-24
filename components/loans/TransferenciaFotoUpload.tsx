'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import {
  Smartphone, Loader2, CheckCircle, Upload, X, Info,
} from 'lucide-react'

interface Props {
  loanId: string
  /** URL de Cloudinary si ya se subió — pasa a modo view. */
  transferenciaFotoUrl: string | null
  transferenciaFotoAt: string | null   // ISO
  readOnly?: boolean
  /** IN_ACTIVATION o ACTIVE. Solo IN_ACTIVATION permite subir. */
  estadoLoan: string
}

/**
 * Flujo de "Activación Virtual" — el coord sube la foto del
 * comprobante de transferencia bancaria y el préstamo se activa
 * inmediatamente. Sin IA, solo evidencia auditada.
 *
 * Se muestra en lugar del componente de video (DisbursementVideo)
 * cuando el préstamo tiene `activacionVirtual = true`.
 */
export function TransferenciaFotoUpload({
  loanId,
  transferenciaFotoUrl,
  transferenciaFotoAt,
  readOnly = false,
  estadoLoan,
}: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [subiendo, setSubiendo] = useState(false)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── VIEW: ya se subió la foto → mostrar evidencia ─────────────────
  if (transferenciaFotoUrl) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-violet-600" />
            Evidencia de desembolso (Activación Virtual)
            <span className="ml-auto flex items-center gap-1 text-xs text-emerald-600 font-normal">
              <CheckCircle className="h-3.5 w-3.5" />
              Registrado
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <img
            src={transferenciaFotoUrl}
            alt="Comprobante de transferencia"
            className="w-full rounded-lg max-h-96 object-contain bg-black/5"
          />
          <p className="text-[11px] text-muted-foreground flex items-start gap-1">
            <Info className="h-3 w-3 mt-0.5 shrink-0" />
            Este crédito se activó mediante Activación Virtual — comprobante de transferencia bancaria.
          </p>
          {transferenciaFotoAt && (
            <p className="text-xs text-muted-foreground">
              Subida: {new Date(transferenciaFotoAt).toLocaleString('es-MX')}
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  // ── Read-only sin evidencia → no renderiza ────────────────────────
  if (readOnly) return null

  // Solo permitir subir si loan está en IN_ACTIVATION
  if (estadoLoan !== 'IN_ACTIVATION') return null

  function elegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setArchivo(file)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(file ? URL.createObjectURL(file) : null)
  }

  function descartar() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setArchivo(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function subir() {
    if (!archivo) return
    setSubiendo(true)
    try {
      const form = new FormData()
      form.append('foto', archivo)

      const r = await fetch(`/api/loans/${loanId}/transferencia-foto`, {
        method: 'POST',
        body: form,
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data?.error ?? data?.message ?? `Error ${r.status}`)

      toast({
        title: '✅ Préstamo activado',
        description: data.message ?? 'Foto de transferencia registrada. Se generó el calendario de pagos.',
      })
      router.refresh()
    } catch (err) {
      toast({
        title: 'Error al subir la foto',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      })
    } finally {
      setSubiendo(false)
    }
  }

  // ── Flujo de subida ──────────────────────────────────────────────
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-violet-600" />
          Foto de transferencia (Activación Virtual)
          <span className="ml-auto text-xs font-normal text-violet-700 bg-violet-100 rounded-full px-2 py-0.5">
            Sin video
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg bg-violet-50 border border-violet-200 p-3 text-sm text-violet-900 space-y-1.5">
          <p className="font-semibold">Este crédito se aprobó como Activación Virtual</p>
          <p>
            Sube <strong>una foto del comprobante de la transferencia bancaria</strong> que realizaste
            al cliente. Al subirla, el préstamo se activa automáticamente y se genera el calendario
            de pagos.
          </p>
          <p className="text-xs text-violet-700">
            Requisitos previos: contrato firmado (candado 1) y comisión de apertura pagada (candado 2).
          </p>
        </div>

        {!archivo ? (
          <div className="space-y-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={elegirArchivo}
              disabled={subiendo}
              className="text-xs w-full"
            />
            <p className="text-[11px] text-muted-foreground flex items-start gap-1">
              <Info className="h-3 w-3 mt-0.5 shrink-0" />
              Puedes tomar la foto en el momento (recomendado) o subir una captura del comprobante.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Preview del comprobante"
                className="w-full rounded-lg max-h-96 object-contain bg-black/5 border"
              />
            )}
            <div className="flex gap-2 flex-wrap">
              <Button onClick={subir} disabled={subiendo} size="lg" className="flex-1 bg-violet-600 hover:bg-violet-700">
                {subiendo ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Subiendo y activando…</>
                ) : (
                  <><Upload className="h-4 w-4 mr-2" /> Subir y activar</>
                )}
              </Button>
              <Button onClick={descartar} variant="outline" size="lg" disabled={subiendo}>
                <X className="h-4 w-4 mr-2" />
                Descartar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
