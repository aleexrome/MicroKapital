'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { RotateCcw, Loader2 } from 'lucide-react'

interface ReprintTicketButtonProps {
  ticketId: string
}

export function ReprintTicketButton({ ticketId }: ReprintTicketButtonProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [processing, setProcessing] = useState(false)

  async function handleReprint() {
    if (!confirm('¿Generar una reimpresión de este ticket?')) return
    setProcessing(true)
    try {
      const res = await fetch(`/api/tickets/${ticketId}/reprint`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? err.error ?? 'Error al reimprimir')
      }
      const { data } = await res.json()
      toast({ title: 'Reimpresion generada', description: `Nuevo ticket: ${data.numeroTicket}` })
      // Vamos directo al flujo de impresion (Bluetooth / PDF), no a otra
      // vista de verificacion. Antes ibamos a /verificar y los usuarios
      // pensaban que no funcionaba y le picaban Reimprimir varias veces
      // generando duplicados sin que saliera fisicamente el ticket.
      router.push(`/thermal-print?ticketId=${data.id}`)
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      })
    } finally {
      setProcessing(false)
    }
  }

  return (
    <Button
      onClick={handleReprint}
      disabled={processing}
      className="w-full bg-primary-600 hover:bg-primary-700 text-white"
    >
      {processing ? (
        <><Loader2 className="h-4 w-4 animate-spin" /> Generando...</>
      ) : (
        <><RotateCcw className="h-4 w-4 mr-1" /> Reimprimir ticket</>
      )}
    </Button>
  )
}
