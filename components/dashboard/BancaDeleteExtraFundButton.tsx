'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/use-toast'
import { Trash2, Loader2 } from 'lucide-react'

/**
 * Elimina un aporte adicional. Confirmación por window.confirm para
 * mantener el componente ligero — no vale la pena un dialog para un
 * click de excepción.
 */
export function BancaDeleteExtraFundButton({ id, label }: { id: string; label: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)

  async function onDelete() {
    if (!confirm(`¿Eliminar aporte ${label}? No se puede deshacer.`)) return
    setSaving(true)
    try {
      const res = await fetch(`/api/banca/adicional/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast({ title: 'Aporte eliminado' })
      router.refresh()
    } catch {
      toast({ title: 'Error', description: 'No se pudo eliminar', variant: 'destructive' })
      setSaving(false)
    }
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={saving}
      title="Eliminar aporte"
      className="rounded p-1 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-50"
    >
      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  )
}
