'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Upload, X, Image as ImageIcon, DollarSign, Smartphone } from 'lucide-react'

interface Props {
  corte: {
    id: string
    numeroCorte: number
    totalAEntregar: string
    consolidadoHijos?: Array<{ id: string; numeroCorte: number; totalAEntregar: string; user: { nombre: string } }>
  }
  receptores: Array<{ id: string; nombre: string; rol: string }>
  onClose: () => void
}

export function EntregarConsolidadoDialog({ corte, receptores, onClose }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [receptorId, setReceptorId] = useState(receptores[0]?.id ?? '')
  const [metodo, setMetodo] = useState<'EFECTIVO_FIRMADO' | 'TRANSFERENCIA'>('EFECTIVO_FIRMADO')

  // Solo DG/DC/SA son receptores válidos para consolidado
  const receptoresFinales = receptores.filter((r) =>
    ['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'SUPER_ADMIN'].includes(r.rol)
  )

  function elegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setFile(f)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(f ? URL.createObjectURL(f) : null)
  }

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
      return new File([blob], f.name.replace(/\.(jpe?g|png|webp)$/i, '.jpg') || 'evidencia.jpg', { type: 'image/jpeg' })
    } catch { return f }
  }

  async function entregar() {
    if (!file || !receptorId) return
    setSubiendo(true)
    try {
      const comprimido = await comprimirFoto(file)
      const fd = new FormData()
      fd.append('receptorId', receptorId)
      fd.append('metodoEntregaFinal', metodo)
      fd.append('evidencia', comprimido)
      const r = await fetch(`/api/cortes/consolidado/${corte.id}/entregar`, { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error ?? `Error ${r.status}`)
      toast({ title: '✅ Consolidado entregado', description: 'Esperando confirmación de DG/DC.' })
      onClose()
      router.refresh()
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
    } finally { setSubiendo(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !subiendo && onClose()}>
      <div className="w-full max-w-md rounded-2xl bg-card border border-border/60 shadow-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h3 className="text-base font-semibold">Entregar consolidado #{corte.numeroCorte}</h3>
          <button onClick={() => !subiendo && onClose()} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3">
          <div className="text-xs text-muted-foreground">Total a entregar</div>
          <div className="text-2xl font-bold tabular-nums text-emerald-400">
            ${Number(corte.totalAEntregar).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </div>
          {corte.consolidadoHijos && corte.consolidadoHijos.length > 0 && (
            <div className="mt-2 pt-2 border-t border-emerald-500/20 space-y-0.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Agrupa</div>
              {corte.consolidadoHijos.map((h) => (
                <div key={h.id} className="flex justify-between text-xs">
                  <span>{h.user.nombre} #{h.numeroCorte}</span>
                  <span className="tabular-nums">${Number(h.totalAEntregar).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Receptor (DG/DC)</label>
          <select
            value={receptorId}
            onChange={(e) => setReceptorId(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            disabled={receptoresFinales.length === 0}
          >
            {receptoresFinales.length === 0 ? (
              <option value="">Sin receptores disponibles</option>
            ) : (
              receptoresFinales.map((r) => (
                <option key={r.id} value={r.id}>{r.nombre} ({r.rol})</option>
              ))
            )}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Método de entrega</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMetodo('EFECTIVO_FIRMADO')}
              className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-xs transition ${metodo === 'EFECTIVO_FIRMADO' ? 'border-emerald-500 bg-emerald-500/10' : 'border-border hover:bg-muted/30'}`}
            >
              <DollarSign className="h-5 w-5" />
              Efectivo + ticket firmado
            </button>
            <button
              type="button"
              onClick={() => setMetodo('TRANSFERENCIA')}
              className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-xs transition ${metodo === 'TRANSFERENCIA' ? 'border-emerald-500 bg-emerald-500/10' : 'border-border hover:bg-muted/30'}`}
            >
              <Smartphone className="h-5 w-5" />
              Transferencia bancaria
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            {metodo === 'TRANSFERENCIA' ? 'Foto del comprobante de transferencia' : 'Foto del ticket firmado por DG/DC'}
          </label>
          <input ref={inputRef} type="file" accept="image/*" onChange={elegirFoto} disabled={subiendo} className="sr-only" />
          {!preview ? (
            <Button type="button" variant="outline" className="w-full py-6 border-dashed" onClick={() => inputRef.current?.click()} disabled={subiendo}>
              <ImageIcon className="h-4 w-4 mr-2" /> Tomar/seleccionar foto
            </Button>
          ) : (
            <div className="space-y-2">
              <img src={preview} alt="Preview" className="w-full rounded-lg max-h-80 object-contain bg-black/5 border" />
              <Button type="button" variant="ghost" size="sm" onClick={() => { setFile(null); if (preview) URL.revokeObjectURL(preview); setPreview(null); if (inputRef.current) inputRef.current.value = '' }} disabled={subiendo}>
                Cambiar foto
              </Button>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={subiendo}>Cancelar</Button>
          <Button onClick={entregar} disabled={!file || !receptorId || subiendo}>
            {subiendo ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando…</> : <><Upload className="h-4 w-4" /> Entregar</>}
          </Button>
        </div>
      </div>
    </div>
  )
}
