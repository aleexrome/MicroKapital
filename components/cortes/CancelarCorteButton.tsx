'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Trash2 } from 'lucide-react'

/**
 * Botón para cancelar un Corte ABIERTO que se abrió por accidente.
 * Confirma con el usuario antes de borrar.
 */
export function CancelarCorteButton({ corteId, tipo }: { corteId: string; tipo: 'PARCIAL' | 'CONSOLIDADO' }) {
  const router = useRouter()
  const { toast } = useToast()
  const [confirmando, setConfirmando] = useState(false)
  const [cargando, setCargando] = useState(false)

  async function cancelar() {
    setCargando(true)
    try {
      const r = await fetch(`/api/cortes/${corteId}/cancelar`, { method: 'DELETE' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error ?? `Error ${r.status}`)
      toast({
        title: tipo === 'CONSOLIDADO' ? '✅ Consolidado cancelado' : '✅ Parcial cancelado',
        description: tipo === 'CONSOLIDADO' ? 'Parciales liberados para re-agrupar.' : 'El efectivo queda disponible para un nuevo parcial.',
      })
      router.refresh()
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Error al cancelar', variant: 'destructive' })
    } finally { setCargando(false); setConfirmando(false) }
  }

  if (!confirmando) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmando(true)} className="text-red-500 hover:bg-red-500/10">
        <Trash2 className="h-3.5 w-3.5" /> Cancelar
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-red-400 mr-1">¿Seguro?</span>
      <Button type="button" variant="destructive" size="sm" onClick={cancelar} disabled={cargando}>
        {cargando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        Sí, cancelar
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmando(false)} disabled={cargando}>
        No
      </Button>
    </div>
  )
}
