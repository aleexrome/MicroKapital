'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'

interface Props {
  goalId: string
  label: string  // descripción para confirmación
}

export function MetaDeleteButton({ goalId, label }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/reportes/metas/${goalId}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'No se pudo eliminar')
      }
      toast({ title: 'Meta eliminada' })
      router.refresh()
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'No se pudo eliminar',
        variant: 'destructive',
      })
    } finally {
      setDeleting(false)
      setConfirming(false)
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground hidden sm:inline">¿Eliminar {label}?</span>
        <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deleting}>
          {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Sí'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={deleting}>
          No
        </Button>
      </div>
    )
  }

  return (
    <Button size="sm" variant="ghost" onClick={() => setConfirming(true)} className="text-rose-400 hover:bg-rose-500/10 hover:text-rose-300">
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  )
}
