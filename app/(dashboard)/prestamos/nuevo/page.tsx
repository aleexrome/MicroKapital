'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoanCalculator } from '@/components/loans/LoanCalculator'
import { useToast } from '@/components/ui/use-toast'
import { ArrowLeft, Loader2, AlertTriangle, Info, ShieldAlert } from 'lucide-react'
import Link from 'next/link'
import type { LoanCalculation } from '@/types'

type LoanTipo = 'SOLIDARIO' | 'INDIVIDUAL' | 'AGIL'

const TIPO_LABELS: Record<LoanTipo, string> = {
  SOLIDARIO: 'Grupo Solidario — 8 semanas',
  INDIVIDUAL: 'Crédito Individual — 12 semanas',
  AGIL: 'Cobranza Ágil — 24 días hábiles',
}

const DEFAULT_TASAS: Record<LoanTipo, number> = {
  SOLIDARIO: 0.40,
  INDIVIDUAL: 0.30,
  AGIL: 0.56,
}

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

export default function NuevoPrestamopPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const [tipo, setTipo] = useState<LoanTipo>('INDIVIDUAL')
  const [capital, setCapital] = useState('')
  const [clienteId, setClienteId] = useState(searchParams.get('clienteId') ?? '')
  const [notas, setNotas] = useState('')
  const [avalNombre, setAvalNombre] = useState('')
  const [avalTelefono, setAvalTelefono] = useState('')
  const [avalRelacion, setAvalRelacion] = useState('')
  const [loading, setLoading] = useState(false)
  const [calc, setCalc] = useState<LoanCalculation | null>(null)

  // Aval check state
  const [avalMatches, setAvalMatches] = useState<AvalMatchItem[]>([])
  const [avalRiskLevel, setAvalRiskLevel] = useState<string | null>(null)
  const [checkingAval, setCheckingAval] = useState(false)

  const handleCalc = useCallback((c: LoanCalculation) => setCalc(c), [])

  // Lookup client name/phone when UUID is entered, then check aval matches
  const [clienteName, setClienteName] = useState('')
  const [clientePhone, setClientePhone] = useState('')

  useEffect(() => {
    if (!clienteId || clienteId.length < 36) {
      setClienteName('')
      setClientePhone('')
      setAvalMatches([])
      setAvalRiskLevel(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clients/${clienteId}`)
        if (res.ok && !cancelled) {
          const { data } = await res.json()
          setClienteName(data.nombreCompleto ?? '')
          setClientePhone(data.telefono ?? '')
        }
      } catch {
        // ignore
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [clienteId])

  useEffect(() => {
    if (!clienteName) {
      setAvalMatches([])
      setAvalRiskLevel(null)
      return
    }
    let cancelled = false
    setCheckingAval(true)
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ nombre: clienteName })
        if (clientePhone) params.set('telefono', clientePhone)
        const res = await fetch(`/api/aval-check?${params}`)
        if (res.ok && !cancelled) {
          const { data } = await res.json()
          setAvalMatches(data.matches ?? [])
          setAvalRiskLevel(data.riskLevel)
        }
      } catch {
        // ignore
      }
      if (!cancelled) setCheckingAval(false)
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [clienteName, clientePhone])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!clienteId || !capital) return
    setLoading(true)

    try {
      const res = await fetch('/api/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: clienteId,
          tipo,
          capital: parseFloat(capital),
          tasaInteres: DEFAULT_TASAS[tipo],
          notas: notas || undefined,
          avalNombre: avalNombre || undefined,
          avalTelefono: avalTelefono || undefined,
          avalRelacion: avalRelacion || undefined,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(JSON.stringify(err.error))
      }

      const { data } = await res.json()
      toast({ title: '✅ Solicitud de préstamo creada', description: 'Pendiente de aprobación del gerente' })
      router.push(`/prestamos/${data.id}`)
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Error al crear solicitud',
        variant: 'destructive',
      })
      setLoading(false)
    }
  }

  const ESTADO_LABELS: Record<string, string> = {
    ACTIVE: 'Activo',
    PENDING_APPROVAL: 'Pendiente',
    DEFAULTED: 'Incumplido',
    RESTRUCTURED: 'Reestructurado',
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/prestamos"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Nueva solicitud de préstamo</h1>
          <p className="text-muted-foreground">La gerente deberá aprobar para activar</p>
        </div>
      </div>

      {/* Aval warning banner */}
      {avalMatches.length > 0 && (
        <Card className={
          avalRiskLevel === 'red'
            ? 'border-red-400 bg-red-50'
            : avalRiskLevel === 'yellow'
            ? 'border-yellow-400 bg-yellow-50'
            : 'border-blue-300 bg-blue-50'
        }>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              {avalRiskLevel === 'red' ? (
                <ShieldAlert className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
              ) : avalRiskLevel === 'yellow' ? (
                <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
              ) : (
                <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1">
                <p className={`font-semibold text-sm ${
                  avalRiskLevel === 'red' ? 'text-red-800' : avalRiskLevel === 'yellow' ? 'text-yellow-800' : 'text-blue-800'
                }`}>
                  Este cliente aparece como aval en {avalMatches.length} préstamo(s)
                </p>
                <div className="mt-2 space-y-1.5">
                  {avalMatches.map((m) => (
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
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Tipo de préstamo */}
        <Card>
          <CardHeader><CardTitle className="text-base">Tipo de préstamo</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(Object.keys(TIPO_LABELS) as LoanTipo[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={`rounded-lg border-2 p-3 text-left transition-colors ${
                  tipo === t
                    ? 'border-primary-700 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="font-medium text-sm">{t}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t === 'SOLIDARIO' ? '8 semanas' : t === 'INDIVIDUAL' ? '12 semanas' : '24 días hábiles'}
                </p>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Datos del préstamo */}
        <Card>
          <CardHeader><CardTitle className="text-base">Datos del préstamo</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="clienteId">ID del cliente *</Label>
              <Input
                id="clienteId"
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
                placeholder="UUID del cliente"
                required
              />
              <p className="text-xs text-muted-foreground">
                Puedes copiarlo desde el expediente del cliente
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="capital">Capital a prestar *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="capital"
                  type="number"
                  min="100"
                  step="100"
                  value={capital}
                  onChange={(e) => setCapital(e.target.value)}
                  className="pl-8"
                  placeholder="5000.00"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notas">Notas (opcional)</Label>
              <Input
                id="notas"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Observaciones del préstamo..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Datos del aval */}
        <Card>
          <CardHeader><CardTitle className="text-base">Datos del aval / garantía</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 space-y-2">
              <Label htmlFor="avalNombre">Nombre del aval</Label>
              <Input
                id="avalNombre"
                value={avalNombre}
                onChange={(e) => setAvalNombre(e.target.value)}
                placeholder="Nombre completo del aval"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="avalTelefono">Teléfono del aval</Label>
              <Input
                id="avalTelefono"
                value={avalTelefono}
                onChange={(e) => setAvalTelefono(e.target.value)}
                placeholder="555-0000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="avalRelacion">Relación con el cliente</Label>
              <Input
                id="avalRelacion"
                value={avalRelacion}
                onChange={(e) => setAvalRelacion(e.target.value)}
                placeholder="Hermano, vecino, amigo..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Calculadora */}
        {capital && Number(capital) > 0 && (
          <LoanCalculator
            tipo={tipo}
            capital={Number(capital)}
            tasaInteres={DEFAULT_TASAS[tipo]}
            onCalc={handleCalc}
          />
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={loading || !clienteId || !capital} className="flex-1 sm:flex-none">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</> : 'Enviar solicitud'}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/prestamos">Cancelar</Link>
          </Button>
        </div>
      </form>
    </div>
  )
}
