'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Banknote, CreditCard, Building2, Camera, Loader2, Send, CheckCircle2, Clock, AlertTriangle, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'

interface Receptor {
  id:     string
  nombre: string
  rol:    string
}

interface Props {
  corteId:              string
  estado:               'ABIERTO' | 'ENTREGADO' | 'ACEPTADO' | 'RECHAZADO'
  fecha:                string
  branchNombre:         string
  totalEfectivoCobrado: number
  totalTarjetaCobrado:  number
  totalTransferenciaCobrado: number
  totalRecibidoDeOtros: number
  totalAEntregar:       number
  receptorActual:       Receptor | null
  receptoresDisponibles: Receptor[]
  fotoTicketUrl:        string | null
  rechazoRazon:         string | null
}

const ROL_LABELS: Record<string, string> = {
  COORDINADOR:        'Coordinadora',
  COBRADOR:           'Cobrador',
  GERENTE:            'Gerente',
  GERENTE_ZONAL:      'Gerente Zonal',
  MESA_CONTROL:       'Mesa de Control',
  DIRECTOR_GENERAL:   'Director General',
  DIRECTOR_COMERCIAL: 'Director Comercial',
  SUPER_ADMIN:        'Super Admin',
}

/**
 * Form principal de la pantalla congelada. Según el estado del corte:
 *
 *   ABIERTO/RECHAZADO → user selecciona receptor + sube foto + marca
 *     entregado. En RECHAZADO se muestra primero la razón visible.
 *
 *   ENTREGADO → readonly, "esperando aceptación de X", muestra foto.
 */
export function CorteCongeladoForm({
  corteId,
  estado,
  fecha,
  branchNombre,
  totalEfectivoCobrado,
  totalTarjetaCobrado,
  totalTransferenciaCobrado,
  totalRecibidoDeOtros,
  totalAEntregar,
  receptorActual,
  receptoresDisponibles,
  fotoTicketUrl,
  rechazoRazon,
}: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [selectedReceptor, setSelectedReceptor] = useState<string>(
    receptorActual?.id ?? (receptoresDisponibles[0]?.id ?? ''),
  )
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const esEntregado = estado === 'ENTREGADO'
  const esRechazado = estado === 'RECHAZADO'
  const esAbierto   = estado === 'ABIERTO'

  /**
   * Comprime la foto en el browser antes de subir. Las fotos de iPhone
   * salen fácilmente a 4-8MB y el server rechaza >10MB, provocando
   * fallos silenciosos. Esta función resuelve lo mismo que ya hace
   * EntregarParcialDialog: redimensiona a max 1600px y re-codifica a
   * JPEG calidad 82%. HEIC/HEIF se dejan como vienen porque
   * createImageBitmap puede no soportarlos en todos los browsers.
   */
  async function comprimirFoto(f: File): Promise<File> {
    if (/heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name)) return f
    try {
      const bmp = await createImageBitmap(f)
      const MAX = 1600
      const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height))
      const w = Math.round(bmp.width * scale)
      const h = Math.round(bmp.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return f
      ctx.drawImage(bmp, 0, 0, w, h)
      bmp.close?.()
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.82))
      if (!blob || blob.size >= f.size) return f
      return new File([blob], f.name.replace(/\.(jpe?g|png|webp)$/i, '.jpg') || 'ticket.jpg', { type: 'image/jpeg' })
    } catch { return f }
  }

  async function onFileSelected(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0]
    ev.target.value = ''
    if (!file) return
    if (!selectedReceptor) {
      toast({ title: 'Elige un receptor antes de subir la foto', variant: 'destructive' })
      return
    }
    if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) {
      toast({ title: 'Solo imágenes', variant: 'destructive' })
      return
    }
    setUploading(true)
    try {
      const comprimido = await comprimirFoto(file)
      const fd = new FormData()
      fd.append('receptorId', selectedReceptor)
      fd.append('foto', comprimido)
      const res = await fetch(`/api/cortes/${corteId}/entregar`, {
        method: 'POST',
        body:   fd,
      })
      const raw = await res.text()
      let data: Record<string, unknown> = {}
      try { data = raw ? JSON.parse(raw) : {} } catch { /* no-json */ }
      if (!res.ok) {
        const msg = (typeof data.error === 'string' && data.error) || `HTTP ${res.status}: ${raw.slice(0, 150)}`
        throw new Error(msg)
      }
      toast({ title: 'Corte entregado', description: 'Esperando aceptación del receptor.' })
      router.refresh()
    } catch (e) {
      toast({
        title: 'Error al entregar',
        description: e instanceof Error ? e.message : 'Error',
        variant: 'destructive',
      })
    } finally {
      setUploading(false)
    }
  }

  const fechaFmt = new Date(fecha).toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <div className="space-y-5">
      {/* Metadata */}
      <div className="rounded-lg border border-gray-700 bg-black/30 p-3 text-xs text-gray-300 space-y-0.5">
        <p><span className="text-gray-400">Fecha:</span> <span className="text-white">{fechaFmt}</span></p>
        <p><span className="text-gray-400">Sucursal:</span> <span className="text-white">{branchNombre}</span></p>
      </div>

      {/* Rechazo visible */}
      {esRechazado && rechazoRazon && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-100 flex gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-300" />
          <div>
            <p className="font-semibold text-red-200 mb-1">Razón del rechazo</p>
            <p>{rechazoRazon}</p>
            <p className="text-xs text-red-300/70 mt-2">Corrige y vuelve a entregar.</p>
          </div>
        </div>
      )}

      {/* Totales — resumen de lo que debe entregar */}
      <div className="rounded-xl border border-primary-600/60 bg-primary-800/40 p-4 space-y-2">
        <p className="text-xs uppercase tracking-wider text-gray-300 mb-2">Resumen del día</p>
        <div className="grid grid-cols-2 gap-3">
          <StatRow icon={<Banknote className="h-4 w-4 text-emerald-400" />} label="Efectivo cobrado" value={totalEfectivoCobrado} />
          <StatRow icon={<CreditCard className="h-4 w-4 text-sky-400" />}    label="Tarjeta cobrado"  value={totalTarjetaCobrado} />
          <StatRow icon={<Building2 className="h-4 w-4 text-amber-400" />}  label="Transferencia"    value={totalTransferenciaCobrado} />
          {totalRecibidoDeOtros > 0 && (
            <StatRow icon={<Banknote className="h-4 w-4 text-fuchsia-300" />} label="Recibido de otros" value={totalRecibidoDeOtros} />
          )}
        </div>
        <div className="border-t border-primary-500/40 mt-3 pt-3 flex justify-between items-center">
          <span className="text-sm font-semibold text-fuchsia-200">A entregar en efectivo</span>
          <span className="text-xl font-bold font-mono text-fuchsia-100">
            ${totalAEntregar.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <p className="text-[11px] text-gray-400">
          (Tarjeta y transferencia no entran al efectivo físico que entregas — ya están en banca.)
        </p>
      </div>

      {/* Estado ENTREGADO (readonly) */}
      {esEntregado && (
        <div className="space-y-3">
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Entregado a <strong>{receptorActual?.nombre ?? 'receptor'}</strong> ({ROL_LABELS[receptorActual?.rol ?? ''] ?? receptorActual?.rol}). Esperando aceptación.
          </div>
          {fotoTicketUrl && (
            <a href={fotoTicketUrl} target="_blank" rel="noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fotoTicketUrl} alt="Ticket firmado" className="w-full max-h-64 rounded-lg border border-gray-700 object-contain bg-black/40" />
              <p className="text-xs text-gray-400 mt-1 text-center">Toca para ver completo</p>
            </a>
          )}
        </div>
      )}

      {/* Estado ABIERTO / RECHAZADO — form para entregar */}
      {(esAbierto || esRechazado) && (
        <div className="space-y-3">
          {receptoresDisponibles.length === 0 ? (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
              No hay receptor disponible para tu sucursal. Avisa a Dirección para que asigne uno
              desde /admin.
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                  Entregar a
                </label>
                <select
                  value={selectedReceptor}
                  onChange={(e) => setSelectedReceptor(e.target.value)}
                  disabled={uploading}
                  className="w-full rounded-md bg-gray-900 border border-gray-700 text-white px-3 py-2 text-sm focus:outline-none focus:border-fuchsia-500"
                >
                  {receptoresDisponibles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre} · {ROL_LABELS[r.rol] ?? r.rol}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-100 space-y-1">
                <p className="font-semibold text-blue-200">Pasos:</p>
                <ol className="list-decimal list-inside space-y-0.5 pl-1">
                  <li>Imprime o toma captura del ticket resumen de hoy.</li>
                  <li>Entrega físicamente ${totalAEntregar.toFixed(2)} en efectivo.</li>
                  <li>Pide la firma del receptor sobre el ticket.</li>
                  <li>Toma foto del ticket firmado y súbela aquí.</li>
                </ol>
              </div>

              <div className="rounded-xl border-2 border-dashed border-gray-600 p-6 text-center space-y-3">
                <Camera className="h-10 w-10 text-gray-500 mx-auto" />
                <p className="text-sm text-gray-300">
                  Sube la foto del ticket con la firma del receptor
                </p>
                {/* iOS Safari no abre el picker al hacer .click() programatico
                    sobre un <input type=file> escondido. La forma nativa que
                    SI funciona en iOS es un <label htmlFor> que envuelva o
                    apunte al input — el tap del label abre el picker
                    directamente, sin pasar por JS. */}
                <label
                  htmlFor="corte-congelado-foto"
                  className={`inline-flex items-center justify-center gap-2 w-full h-10 px-4 py-2 rounded-xl text-sm font-medium bg-primary-500 text-white hover:bg-primary-400 shadow-glow transition-all duration-150 cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  {uploading
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Subiendo y entregando...</>
                    : <><Upload className="h-4 w-4" /> Seleccionar foto y entregar</>}
                </label>
                <input
                  id="corte-congelado-foto"
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={onFileSelected}
                  disabled={uploading}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function StatRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-black/30 p-2 text-sm">
      <span className="flex items-center gap-1.5 text-gray-300">{icon}{label}</span>
      <span className="font-mono text-white">
        ${value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    </div>
  )
}
