'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { formatMoney, formatDateTime } from '@/lib/utils'
import { CheckCircle, Loader2, Building2, Clock, ShieldCheck } from 'lucide-react'
import type { UserRole } from '@prisma/client'

export interface TransferRow {
  id: string
  monto: string
  fechaHora: string
  idTransferencia: string | null
  statusTransferencia: string | null
  verificadoAt: string | null
  cuentaDestino: { banco: string; titular: string; clabe: string } | null
  cobrador: { nombre: string }
  verificadoPor: { nombre: string } | null
  client: { nombreCompleto: string }
  loan: { tipo: string }
}

interface Props {
  rows: TransferRow[]
  puedeVerificar: boolean
  rol: UserRole
}

export function TransferenciasView({ rows, puedeVerificar, rol }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [processing, setProcessing] = useState<string | null>(null)

  const pendientes = rows.filter((r) => r.statusTransferencia === 'PENDIENTE')
  const verificadas = rows.filter((r) => r.statusTransferencia === 'VERIFICADO')

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
      toast({ title: '✅ Transferencia verificada', description: 'El pago se aplicó al calendario' })
      router.refresh()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      })
    } finally {
      setProcessing(null)
    }
  }

  const esDirector = rol === 'DIRECTOR_GENERAL' || rol === 'DIRECTOR_COMERCIAL'
  const esCoordinador = rol === 'COORDINADOR' || rol === 'COBRADOR'

  const subtitulo = puedeVerificar
    ? 'Confirma que el dinero llegó a la cuenta antes de aplicar el pago al calendario.'
    : esDirector
    ? 'Historial y seguimiento de transferencias — quién las validó y cuándo.'
    : esCoordinador
    ? 'Estado de las transferencias capturadas: pendientes y ya verificadas por el gerente.'
    : 'Transferencias capturadas y su estado de validación.'

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Transferencias</h1>
        <p className="text-muted-foreground">{subtitulo}</p>
      </div>

      {/* ── PENDIENTES ─────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-yellow-500" />
          <h2 className="text-sm font-semibold">
            Pendientes de verificación <span className="text-muted-foreground">({pendientes.length})</span>
          </h2>
        </div>

        {pendientes.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No hay transferencias pendientes de verificación</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {pendientes.map((p) => (
              <Card key={p.id} className="border-yellow-500/20 bg-yellow-500/5">
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
                        <p><span className="text-muted-foreground">Capturado:</span> {formatDateTime(p.fechaHora)}</p>
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
                    {puedeVerificar && (
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
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ── VERIFICADAS ────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          <h2 className="text-sm font-semibold">
            Verificadas <span className="text-muted-foreground">({verificadas.length})</span>
          </h2>
        </div>

        {verificadas.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <p className="text-sm text-muted-foreground">Aún no hay transferencias verificadas</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {verificadas.map((p) => (
              <Card key={p.id}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <ShieldCheck className="h-4 w-4 text-emerald-500" />
                        <Badge variant="success">Verificada</Badge>
                        <span className="font-semibold text-sm">{p.client.nombreCompleto}</span>
                      </div>
                      <div className="text-sm text-gray-700 space-y-0.5">
                        <p><span className="text-muted-foreground">Monto:</span> <span className="font-semibold money">{formatMoney(Number(p.monto))}</span></p>
                        <p><span className="text-muted-foreground">Cobrador:</span> {p.cobrador.nombre}</p>
                        <p><span className="text-muted-foreground">Capturado:</span> {formatDateTime(p.fechaHora)}</p>
                        {p.idTransferencia && (
                          <p><span className="text-muted-foreground">Referencia:</span> <span className="font-mono">{p.idTransferencia}</span></p>
                        )}
                        {p.cuentaDestino && (
                          <p className="flex items-center gap-1">
                            <Building2 className="h-3 w-3 text-muted-foreground" />
                            {p.cuentaDestino.banco} — CLABE: {p.cuentaDestino.clabe}
                          </p>
                        )}
                        <p className="pt-1 mt-1 border-t border-border text-emerald-600">
                          <span className="text-muted-foreground">Validada por:</span>{' '}
                          <span className="font-medium">{p.verificadoPor?.nombre ?? '—'}</span>
                          {p.verificadoAt && (
                            <> · {formatDateTime(p.verificadoAt)}</>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
