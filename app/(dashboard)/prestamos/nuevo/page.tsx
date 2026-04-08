'use client'

import { useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoanCalculator } from '@/components/loans/LoanCalculator'
import { useToast } from '@/components/ui/use-toast'
import { ArrowLeft, Loader2, UserCheck, FileText } from 'lucide-react'
import Link from 'next/link'
import type { LoanCalculation } from '@/types'

type LoanTipo = 'SOLIDARIO' | 'INDIVIDUAL' | 'AGIL' | 'FIDUCIARIO'

const TIPO_INFO: Record<LoanTipo, { label: string; plazo: string; desc: string }> = {
  SOLIDARIO:   { label: 'Grupo Solidario',   plazo: '8 semanas',       desc: '$175/$195 por cada mil · mín 4 integrantes' },
  INDIVIDUAL:  { label: 'Individual',         plazo: '12 semanas',      desc: '$170 por cada mil · comisión por ciclo' },
  AGIL:        { label: 'Cobranza Ágil',      plazo: '24 días hábiles', desc: '$65/$75 por cada mil · 18–45 años' },
  FIDUCIARIO:  { label: 'Fiduciario',         plazo: '12 quincenas',    desc: '10% comisión · garantía mueble o inmueble' },
}

export default function NuevaSolicitudPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const [tipo, setTipo] = useState<LoanTipo>('INDIVIDUAL')
  const [capital, setCapital] = useState('')
  const [clienteId, setClienteId] = useState(searchParams.get('clienteId') ?? '')
  const [notas, setNotas] = useState('')
  const [loading, setLoading] = useState(false)
  const [calc, setCalc] = useState<LoanCalculation | null>(null)

  // Campos por tipo
  const [tipoGrupo, setTipoGrupo]           = useState<'REGULAR' | 'RESCATE'>('REGULAR')
  const [ciclo, setCiclo]                   = useState(1)
  const [tuvoAtraso, setTuvoAtraso]         = useState(false)
  const [clienteIrregular, setClienteIrregular] = useState(false)
  const [tasaFid, setTasaFid]               = useState('0.30')
  const [tipoGarantia, setTipoGarantia]     = useState<'MUEBLE' | 'INMUEBLE'>('INMUEBLE')
  const [descGarantia, setDescGarantia]     = useState('')
  const [valorGarantia, setValorGarantia]   = useState('')
  // Aval (INDIVIDUAL y FIDUCIARIO)
  const [avalNombre, setAvalNombre]         = useState('')
  const [avalTelefono, setAvalTelefono]     = useState('')
  const [avalRelacion, setAvalRelacion]     = useState('')

  const handleCalc = useCallback((c: LoanCalculation) => setCalc(c), [])

  const capitalNum = Number(capital)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!clienteId || !capital) return
    setLoading(true)

    try {
      const body: Record<string, unknown> = {
        clientId: clienteId,
        tipo,
        capital: capitalNum,
        notas: notas || undefined,
      }

      if (tipo === 'SOLIDARIO') {
        body.tipoGrupo = tipoGrupo
      } else if (tipo === 'INDIVIDUAL') {
        body.ciclo = ciclo
        body.tuvoAtraso = tuvoAtraso
        if (avalNombre) { body.avalNombre = avalNombre; body.avalTelefono = avalTelefono || undefined; body.avalRelacion = avalRelacion || undefined }
      } else if (tipo === 'AGIL') {
        body.clienteIrregular = clienteIrregular
      } else if (tipo === 'FIDUCIARIO') {
        body.tasaInteres = parseFloat(tasaFid)
        body.tipoGarantia = tipoGarantia
        body.descripcionGarantia = descGarantia || undefined
        body.valorGarantia = valorGarantia ? parseFloat(valorGarantia) : undefined
        if (avalNombre) { body.avalNombre = avalNombre; body.avalTelefono = avalTelefono || undefined; body.avalRelacion = avalRelacion || undefined }
      }

      const res = await fetch('/api/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(typeof err.error === 'string' ? err.error : 'Error al crear solicitud')
      }

      const { data } = await res.json()
      toast({ title: '✅ Solicitud enviada', description: 'Pendiente de aprobación' })
      router.push(`/prestamos/${data.id}`)
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' })
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/prestamos"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Nueva solicitud de préstamo</h1>
          <p className="text-muted-foreground">Requiere aprobación del Director General</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* ── Tipo de préstamo ────────────────────────────────── */}
        <Card>
          <CardHeader><CardTitle className="text-base">Tipo de préstamo</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(Object.keys(TIPO_INFO) as LoanTipo[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={`rounded-lg border-2 p-3 text-left transition-colors ${
                  tipo === t ? 'border-primary-700 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="font-semibold text-sm">{TIPO_INFO[t].label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{TIPO_INFO[t].plazo}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* ── Campos base ─────────────────────────────────────── */}
        <Card>
          <CardHeader><CardTitle className="text-base">Datos de la solicitud</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="clienteId">ID del cliente *</Label>
              <Input
                id="clienteId"
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
                placeholder="UUID del cliente"
                required
              />
              <p className="text-xs text-muted-foreground">Cópialo desde el expediente del cliente</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="capital">Capital a prestar *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  id="capital"
                  type="number"
                  min="100"
                  step="100"
                  value={capital}
                  onChange={(e) => setCapital(e.target.value)}
                  className="pl-7"
                  placeholder="5000"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">{TIPO_INFO[tipo].desc}</p>
            </div>

            {/* Campos SOLIDARIO */}
            {tipo === 'SOLIDARIO' && (
              <div className="space-y-1.5">
                <Label>Tipo de grupo</Label>
                <div className="flex gap-3">
                  {(['REGULAR', 'RESCATE'] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setTipoGrupo(g)}
                      className={`flex-1 rounded-lg border-2 py-2 text-sm font-medium transition-colors ${
                        tipoGrupo === g ? 'border-primary-700 bg-primary-50 text-primary-800' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {g === 'REGULAR' ? 'Regular · $175/mil' : 'Rescate · $195/mil'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Campos INDIVIDUAL */}
            {tipo === 'INDIVIDUAL' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Ciclo del cliente</Label>
                  <div className="flex gap-2">
                    {[1, 2, 3].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCiclo(c)}
                        className={`flex-1 rounded-lg border-2 py-2 text-sm font-medium transition-colors ${
                          ciclo === c ? 'border-primary-700 bg-primary-50 text-primary-800' : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        Ciclo {c}{c === 3 ? '+' : ''}<br />
                        <span className="text-xs font-normal text-muted-foreground">
                          {c === 1 ? '10%' : c === 2 ? '7%' : '5%'} comisión
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tuvoAtraso}
                    onChange={(e) => setTuvoAtraso(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">Cliente tuvo atraso en ciclo anterior <span className="text-muted-foreground">(comisión 12%)</span></span>
                </label>
              </div>
            )}

            {/* Campos ÁGIL */}
            {tipo === 'AGIL' && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={clienteIrregular}
                  onChange={(e) => setClienteIrregular(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Cliente irregular <span className="text-muted-foreground">($75/mil en lugar de $65/mil)</span></span>
              </label>
            )}

            {/* Campos FIDUCIARIO */}
            {tipo === 'FIDUCIARIO' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Tipo de garantía</Label>
                  <div className="flex gap-3">
                    {(['MUEBLE', 'INMUEBLE'] as const).map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setTipoGarantia(g)}
                        className={`flex-1 rounded-lg border-2 py-2 text-sm font-medium transition-colors ${
                          tipoGarantia === g ? 'border-primary-700 bg-primary-50 text-primary-800' : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {g === 'MUEBLE' ? 'Bien Mueble' : 'Bien Inmueble'}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {tipoGarantia === 'MUEBLE'
                      ? 'El bien queda físicamente con la empresa'
                      : 'Los papeles de propiedad quedan con la empresa'}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="descGarantia">Descripción de la garantía</Label>
                  <Input
                    id="descGarantia"
                    value={descGarantia}
                    onChange={(e) => setDescGarantia(e.target.value)}
                    placeholder="Ej: Televisión Samsung 55 pulgadas"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="valorGarantia">Valor avaluado de la garantía ($)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <Input
                      id="valorGarantia"
                      type="number"
                      min="0"
                      step="100"
                      value={valorGarantia}
                      onChange={(e) => setValorGarantia(e.target.value)}
                      className="pl-7"
                      placeholder="10000"
                    />
                  </div>
                  {valorGarantia && Number(valorGarantia) > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Capital permitido: ${(Number(valorGarantia) * 0.40).toLocaleString()} – ${(Number(valorGarantia) * 0.50).toLocaleString()} (40–50% del valor)
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tasaFid">Tasa de interés (%)</Label>
                  <div className="relative">
                    <Input
                      id="tasaFid"
                      type="number"
                      min="0.01"
                      max="1"
                      step="0.01"
                      value={tasaFid}
                      onChange={(e) => setTasaFid(e.target.value)}
                      className="pr-8"
                      placeholder="0.30"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Definida por la empresa (ej: 0.30 = 30%)</p>
                </div>
              </div>
            )}

            {/* Aval — requerido en INDIVIDUAL y FIDUCIARIO */}
            {(tipo === 'INDIVIDUAL' || tipo === 'FIDUCIARIO') && (
              <div className="rounded-xl border border-border/60 bg-secondary/30 p-4 space-y-3">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-primary" />
                  Datos del aval
                  <span className="text-xs font-normal text-muted-foreground">(garantía personal requerida para este producto)</span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="avalNombre">Nombre completo *</Label>
                    <Input id="avalNombre" value={avalNombre} onChange={(e) => setAvalNombre(e.target.value)} placeholder="Nombre del aval" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="avalTelefono">Teléfono</Label>
                    <Input id="avalTelefono" value={avalTelefono} onChange={(e) => setAvalTelefono(e.target.value)} placeholder="10 dígitos" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="avalRelacion">Relación con el cliente</Label>
                    <select id="avalRelacion" value={avalRelacion} onChange={(e) => setAvalRelacion(e.target.value)}
                      className="w-full h-10 rounded-xl border border-border/60 bg-secondary/60 px-3 text-sm text-foreground">
                      <option value="">Seleccionar...</option>
                      <option value="CONYUGE">Cónyuge</option>
                      <option value="FAMILIAR">Familiar directo</option>
                      <option value="CONOCIDO">Conocido / Amigo</option>
                      <option value="OTRO">Otro</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
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

        {/* Aviso sobre documentos */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
          <FileText className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-foreground">Documentación requerida</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Una vez enviada la solicitud, podrás subir los documentos del cliente (INE, comprobante de domicilio, fotografía, etc.)
              directamente desde la pantalla del crédito. El Director General puede solicitar documentos adicionales antes de aprobar.
            </p>
          </div>
        </div>

        {/* ── Calculadora ─────────────────────────────────────── */}
        {capitalNum > 0 && (
          <LoanCalculator
            tipo={tipo}
            capital={capitalNum}
            tasaInteres={tipo === 'FIDUCIARIO' ? parseFloat(tasaFid) : undefined}
            ciclo={tipo === 'INDIVIDUAL' ? (tuvoAtraso ? ciclo : ciclo) : undefined}
            tuvoAtraso={tipo === 'INDIVIDUAL' ? tuvoAtraso : undefined}
            clienteIrregular={tipo === 'AGIL' ? clienteIrregular : undefined}
            tipoGrupo={tipo === 'SOLIDARIO' ? tipoGrupo : undefined}
            onCalc={handleCalc}
          />
        )}

        <div className="flex gap-3 pt-2">
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
