'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, CheckCircle2 } from 'lucide-react'

export function AceptarParcialButton({ corteId, montoEsperado }: { corteId: string; montoEsperado: number }) {
  const router = useRouter()
  const { toast } = useToast()
  const [cargando, setCargando] = useState(false)

  async function aceptar() {
    setCargando(true)
    try {
      const r = await fetch(`/api/cortes/${corteId}/aceptar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ montoAceptado: montoEsperado }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error ?? `Error ${r.status}`)
      toast({ title: '✅ Parcial aceptado' })
      router.refresh()
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
    } finally { setCargando(false) }
  }

  return (
    <Button size="sm" onClick={aceptar} disabled={cargando}>
      {cargando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
      Aceptar
    </Button>
  )
}
