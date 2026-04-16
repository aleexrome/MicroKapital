'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatMoney, formatDate } from '@/lib/utils'
import { useToast } from '@/components/ui/use-toast'
import { CheckCircle, XCircle, Loader2, AlertCircle, ShieldAlert, AlertTriangle, Info } from 'lucide-react'

interface AvalMatchItem {
  loanId: string
  loanEstado: string
  loanTipo: string
  capital: number
  clienteNombre: string
  clienteScore: number
  scoreColor: string
  scoreLabel: string
  scoreNivel: string
  matchType: string
}

interface AvalCheckResult {
  matches: AvalMatchItem[]
  riskLevel: 'red' | 'yellow' | 'green' | null
  hasMatches: boolean
}

interface LoanPending {
  id: string
  tipo: string
  capital: string
  totalPago: string
  pagoSemanal: string | null
  pagoDiario: string | null
  plazo: number
  notas: string | null
  createdAt: string
  client: { id: string; nombreCompleto: string; telefono: string | null; score: number }
  cobrador: { nombre: string }
}

const ESTADO_LABELS: Record<string, string> = {
  ACTIVE: 'Activo',
  PENDING_APPROVAL: 'Pendiente',
  DEFAULTED: 'Incumplido',
  RESTRUCTURED: 'Reestructurado',
}

export default function AprobacionesPage() {
  const { toast } = useToast()
  const [loans, setLoans] = useState<LoanPending[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [razonRechazo, setRazonRechazo] = useState('')

  // Aval check state: keyed by loan ID
  const [avalChecks, setAvalChecks] = useState<Record<string, AvalCheckResult>>({})
  const [avalOverrides, setAvalOverrides] = useState<Record<string, boolean>>({})

  async function loadLoans() {
    const res = await fetch('/api/loans?estado=PENDING_APPROVAL')
    const data = await res.json()
    setLoans(data.data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadLoans() }, [])

  // Run aval checks for all pending loans
  const checkAvales = useCallback(async (loansList: LoanPending[]) => {
    const results: Record<string, AvalCheckResult> = {}
    await Promise.all(
      loansList.map(async (loan) => {
        try {
          const params = new URLSearchParams({ nombre: loan.client.nombreCompleto })
          if (loan.client.telefono) params.set('telefono', loan.client.telefono)
          const res = await fetch(`/api/aval-check?${params}`)
          if (res.ok) {
            const { data } = await res.json()
            results[loan.id] = data
          }
        } catch {
          // ignore individual failures
        }
      })
    )
    setAvalChecks(results)
  }, [])

  useEffect(() => {
    if (loans.length > 0) {
      checkAvales(loans)
    }
  }, [loans, checkAvales])

  async function handleApprove(loanId: string) {
    const check = avalChecks[loanId]
    const needsOverride = check?.riskLevel === 'red'

    if (needsOverride && !avalOverrides[loanId]) {
      toast({
        title: 'Confirma la alerta de aval',
        description: 'Debes marcar la casilla de confirmación antes de aprobar este préstamo.',
        variant: 'destructive',
      })
      return
    }

    setProcessing(loanId)
    try {
      const res = await fetch(`/api/loans/${loanId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avalOverride: needsOverride ? true : undefined,
        }),
      })
      if (!res.ok) throw new Error('Error al aprobar')
      toast({ title: '✅ Préstamo aprobado', description: 'Calendario de pagos generado' })
      loadLoans()
    } catch {
      toast({ title: 'Error', description: 'No se pudo aprobar el préstamo', variant: 'destructive' })
    } finally {
      setProcessing(null)
    }
  }

  async function handleReject(loanId: string) {
    if (!razonRechazo.trim()) return
    setProcessing(loanId)
    try {
      const res = await fetch(`/api/loans/${loanId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ razonRechazo }),
      })
      if (!res.ok) throw new Error('Error al rechazar')
      toast({ title: 'Préstamo rechazado', variant: 'default' })
      setRejectId(null)
      setRazonRechazo('')
      loadLoans()
    } catch {
      toast({ title: 'Error', description: 'No se pudo rechazar', variant: 'destructive' })
    } finally {
      setProcessing(null)
    }
  }

  function renderAvalAlert(loanId: string) {
    const check = avalChecks[loanId]
    if (!check?.hasMatches) return null

    const isRed = check.riskLevel === 'red'
    const isYellow = check.riskLevel === 'yellow'

    return (
      <div className={`mt-3 rounded-lg p-3 border ${
        isRed
          ? 'bg-red-50 border-red-300'
          : isYellow
          ? 'bg-yellow-50 border-yellow-300'
          : 'bg-blue-50 border-blue-200'
      }`}>
        <div className="flex items-start gap-2">
          {isRed ? (
            <ShieldAlert className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
          ) : isYellow ? (
            <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
          ) : (
            <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
          )}
          <div className="flex-1">
            <p className={`text-sm font-semibold ${
              isRed ? 'text-red-800' : isYellow ? 'text-yellow-800' : 'text-blue-800'
            }`}>
              {isRed
                ? 'ALERTA: Este cliente es aval de un préstamo con riesgo alto'
                : isYellow
                ? 'Advertencia: Este cliente es aval de un préstamo con atraso'
                : 'Info: Este cliente aparece como aval en otro préstamo'}
            </p>
            <div className="mt-1.5 space-y-1">
              {check.matches.map((m) => (
                <div key={m.loanId} className="text-sm flex items-center gap-2">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: m.scoreColor }}
                  />
                  <span>
                    Aval de <strong>{m.clienteNombre}</strong> — {m.loanTipo} {ESTADO_LABELS[m.loanEstado] ?? m.loanEstado} — Score: {m.clienteScore} ({m.scoreLabel})
                  </span>
                </div>
              ))}
            </div>

            {/* Override checkbox for red risk */}
            {isRed && (
              <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!avalOverrides[loanId]}
                  onChange={(e) =>
                    setAvalOverrides((prev) => ({ ...prev, [loanId]: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-red-400 text-red-600 focus:ring-red-500"
                />
                <span className="text-sm text-red-700 font-medium">
                  Estoy consciente del riesgo y deseo proceder con la aprobación
                </span>
              </label>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Bandeja de aprobaciones</h1>
        <p className="text-muted-foreground">{loans.length} préstamo(s) pendiente(s)</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary-700" />
        </div>
      ) : loans.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-3" />
            <p className="text-muted-foreground">No hay solicitudes pendientes</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {loans.map((loan) => {
            const check = avalChecks[loan.id]
            const isBlocked = check?.riskLevel === 'red' && !avalOverrides[loan.id]

            return (
              <Card key={loan.id}>
                <CardContent className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertCircle className="h-4 w-4 text-yellow-500" />
                        <span className="font-semibold">{loan.client.nombreCompleto}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm mt-2">
                        <div><span className="text-muted-foreground">Tipo:</span> {loan.tipo}</div>
                        <div><span className="text-muted-foreground">Capital:</span> <span className="font-medium money">{formatMoney(Number(loan.capital))}</span></div>
                        <div><span className="text-muted-foreground">Total:</span> <span className="font-semibold money">{formatMoney(Number(loan.totalPago))}</span></div>
                        <div>
                          <span className="text-muted-foreground">Pago:</span>{' '}
                          <span className="font-medium money">
                            {loan.pagoSemanal ? `${formatMoney(Number(loan.pagoSemanal))}/sem` : `${formatMoney(Number(loan.pagoDiario))}/día`}
                          </span>
                        </div>
                        <div><span className="text-muted-foreground">Plazo:</span> {loan.plazo} {loan.tipo === 'AGIL' ? 'días' : 'semanas'}</div>
                        <div><span className="text-muted-foreground">Cobrador:</span> {loan.cobrador.nombre}</div>
                      </div>
                      {loan.notas && (
                        <p className="text-sm text-muted-foreground mt-2 italic">{loan.notas}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">Solicitado: {formatDate(loan.createdAt)}</p>

                      {/* Aval alert */}
                      {renderAvalAlert(loan.id)}
                    </div>

                    <div className="flex flex-col gap-2 sm:items-end">
                      {rejectId === loan.id ? (
                        <div className="flex flex-col gap-2 w-full sm:w-64">
                          <input
                            className="border rounded px-3 py-2 text-sm w-full"
                            placeholder="Razón del rechazo..."
                            value={razonRechazo}
                            onChange={(e) => setRazonRechazo(e.target.value)}
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={!razonRechazo.trim() || processing === loan.id}
                              onClick={() => handleReject(loan.id)}
                              className="flex-1"
                            >
                              {processing === loan.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirmar rechazo'}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setRejectId(null)}>Cancelar</Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="success"
                            disabled={!!processing || isBlocked}
                            onClick={() => handleApprove(loan.id)}
                            title={isBlocked ? 'Marca la casilla de confirmación para aprobar' : undefined}
                          >
                            {processing === loan.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><CheckCircle className="h-4 w-4" /> Aprobar</>}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-300 text-red-600 hover:bg-red-50"
                            onClick={() => setRejectId(loan.id)}
                          >
                            <XCircle className="h-4 w-4" /> Rechazar
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
