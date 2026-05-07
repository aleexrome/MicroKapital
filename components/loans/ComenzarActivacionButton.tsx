'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, PlayCircle } from 'lucide-react'

interface ComenzarActivacionButtonProps {
  loanId: string
}

/**
 * Botón "Comenzar activación" — visible cuando loan.estado === 'APPROVED'.
 * Llama a /api/loans/[id]/start-activation y mueve el préstamo a
 * IN_ACTIVATION. A partir de ese momento aparecen los 3 candados.
 */
export function ComenzarActivacionButton({ loanId }: ComenzarActivacionButtonProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    try {
      const res = await fetch(`/api/loans/${loanId}/start-activation`, {
        method: 'POST',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Error al iniciar activación')
      }
      toast({
        title: 'Activación iniciada',
        description: 'Sigue los 3 candados para completar el desembolso.',
      })
      router.refresh()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button onClick={handleClick} disabled={loading} className="bg-primary-600 hover:bg-primary-700 text-white">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
      Comenzar activación
    </Button>
  )
}
