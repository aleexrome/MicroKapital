'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { formatMoney, formatDateTime } from '@/lib/utils'
import { CheckCircle, Loader2, Building2, Clock } from 'lucide-react'

interface TransferPayment {
  id: string
  monto: string
  fechaHora: string
  idTransferencia: string | null
  statusTransferencia: string | null
  cuentaDestino: { banco: string; titular: string; clabe: string } | null
  cobrador: { nombre: string }
  client: { nombreCompleto: string }
  loan: { tipo: string }
}

export default function TransferenciasPage() {
  const { toast } = useToast()
  const [payments, setPayments] = useState<TransferPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)

  async function loadTransfers() {
    const res = await fetch('/api/payments?metodo=TRANSFER&status=PENDIENTE')
    const data = await res.json()
    setPayments(data.data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadTransfers() }, [])

  async function handleVerify(paymentId: string) {
    setProcessing(paymentId)
    try {
      const res = await fetch('/api/payments/verify-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Error al verificar')
      }
      toast({ title: '✅ Transferencia verificada', description: 'El pago fue confirmado' })
      loadTransfers()
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' })
    } finally {
      setProcessing(null)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Verificación de transferencias</h1>
        <p className="text-muted-foreground">Confirma que el dinero llegó a la cuenta antes de marcar como verificado</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary-700" />
        </div>
      ) : payments.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-3" />
            <p className="text-muted-foreground">No hay transferencias pendientes de verificación</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {payments.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="h-4 w-4 text-yellow-500" />
                      <Badge variant="secondary">Pendiente</Badge>
                      <span className="font-semibold text-sm">{p.client.nombreCompleto}</span>
                    </div>
                    <div className="text-sm text-gray-700 space-y-0.5">
                      <p><span className="text-muted-foreground">Monto:</span> <span className="font-semibold money">{formatMoney(Number(p.monto))}</span></p>
                      <p><span className="text-muted-foreground">Cobrador:</span> {p.cobrador.nombre}</p>
                      <p><span className="text-muted-foreground">Fecha:</span> {formatDateTime(p.fechaHora)}</p>
                      {p.idTransferencia && (
                        <p><span className="text-muted-foreground">Referencia:</span> <span className="font-mono">{p.idTransferencia}</span></p>
                      )}
                      {p.cuentaDestino && (
                        <p className="flex items-center gap-1">
                          <Building2 className="h-3 w-3 text-muted-foreground" />
                          {p.cuentaDestino.banco} — CLABE: {p.cuentaDestino.clabe}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="success"
                    disabled={!!processing}
                    onClick={() => handleVerify(p.id)}
                  >
                    {processing === p.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <><CheckCircle className="h-4 w-4" /> Verificar</>}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
