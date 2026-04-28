'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { Save, ArrowLeft } from 'lucide-react'
import type { LoanType } from '@prisma/client'

const TIPO_LABEL: Record<LoanType, string> = {
  SOLIDARIO:  'Solidario',
  INDIVIDUAL: 'Individual',
  AGIL:       'Ágil',
  FIDUCIARIO: 'Fiduciario',
}

interface InitialValues {
  id?: string
  branchId?: string | null
  cobradorId?: string | null
  loanType?: LoanType | null
  semanaInicio?: string  // ISO yyyy-mm-dd
  metaCapitalColocado?: number | null
  metaCreditosColocados?: number | null
  metaCobranzaEsperada?: number | null
  metaCobranzaEfectiva?: number | null
  metaMoraMaxima?: number | null
  metaCrecimiento?: number | null
  notas?: string | null
}

interface Props {
  initial?: InitialValues
  branches: Array<{ id: string; nombre: string }>
  cobradores: Array<{ id: string; nombre: string; branchId: string | null }>
}

/** Formato ISO yyyy-mm-dd del lunes de la semana actual. */
function lunesDeEstaSemanaIso(): string {
  const d = new Date()
  const dist = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dist)
  return d.toISOString().slice(0, 10)
}

export function MetaForm({ initial, branches, cobradores }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)

  const [semanaInicio, setSemanaInicio] = useState(initial?.semanaInicio ?? lunesDeEstaSemanaIso())
  const [branchId, setBranchId] = useState(initial?.branchId ?? '')
  const [cobradorId, setCobradorId] = useState(initial?.cobradorId ?? '')
  const [loanType, setLoanType] = useState<LoanType | ''>(initial?.loanType ?? '')
  const [metaCapitalColocado, setMetaCapitalColocado] = useState(initial?.metaCapitalColocado?.toString() ?? '')
  const [metaCreditosColocados, setMetaCreditosColocados] = useState(initial?.metaCreditosColocados?.toString() ?? '')
  const [metaCobranzaEsperada, setMetaCobranzaEsperada] = useState(initial?.metaCobranzaEsperada?.toString() ?? '')
  const [metaCobranzaEfectiva, setMetaCobranzaEfectiva] = useState(initial?.metaCobranzaEfectiva?.toString() ?? '')
  const [metaMoraMaxima, setMetaMoraMaxima] = useState(initial?.metaMoraMaxima?.toString() ?? '')
  const [metaCrecimiento, setMetaCrecimiento] = useState(initial?.metaCrecimiento?.toString() ?? '')
  const [notas, setNotas] = useState(initial?.notas ?? '')

  const cobradoresVisibles = branchId
    ? cobradores.filter((c) => c.branchId === branchId)
    : cobradores

  function parseNum(s: string): number | null {
    if (!s.trim()) return null
    const n = parseFloat(s.replace(/,/g, ''))
    return Number.isFinite(n) ? n : null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return

    const payload = {
      semanaInicio,
      branchId: branchId || null,
      cobradorId: cobradorId || null,
      loanType: loanType || null,
      metaCapitalColocado:   parseNum(metaCapitalColocado),
      metaCreditosColocados: metaCreditosColocados.trim() ? parseInt(metaCreditosColocados, 10) : null,
      metaCobranzaEsperada:  parseNum(metaCobranzaEsperada),
      metaCobranzaEfectiva:  parseNum(metaCobranzaEfectiva),
      metaMoraMaxima:        parseNum(metaMoraMaxima),
      metaCrecimiento:       parseNum(metaCrecimiento),
      notas: notas.trim() || null,
    }

    // Validación: al menos un KPI definido
    const algunKpi = [
      payload.metaCapitalColocado, payload.metaCreditosColocados,
      payload.metaCobranzaEsperada, payload.metaCobranzaEfectiva,
      payload.metaMoraMaxima, payload.metaCrecimiento,
    ].some((v) => v != null)
    if (!algunKpi) {
      toast({ title: 'Define al menos un KPI', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      const url = initial?.id
        ? `/api/reportes/metas/${initial.id}`
        : '/api/reportes/metas'
      const method = initial?.id ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'No se pudo guardar la meta')
      }
      toast({ title: initial?.id ? 'Meta actualizada' : 'Meta creada' })
      router.push('/reportes/metas')
      router.refresh()
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'No se pudo guardar',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">
          {initial?.id ? 'Editar meta' : 'Nueva meta'}
        </h1>
      </div>

      <Card>
        <CardHeader><CardTitle>Periodo y alcance</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="semanaInicio">Semana (lunes de inicio)</Label>
            <Input
              id="semanaInicio"
              type="date"
              required
              value={semanaInicio}
              onChange={(e) => setSemanaInicio(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              La meta cubre la semana lunes-domingo a partir de esta fecha.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="branchId">Sucursal (opcional)</Label>
              <select
                id="branchId"
                value={branchId}
                onChange={(e) => { setBranchId(e.target.value); setCobradorId('') }}
                className="flex h-10 w-full rounded-xl border border-border/60 bg-secondary/60 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Toda la empresa</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="cobradorId">Cobrador (opcional)</Label>
              <select
                id="cobradorId"
                value={cobradorId}
                onChange={(e) => setCobradorId(e.target.value)}
                className="flex h-10 w-full rounded-xl border border-border/60 bg-secondary/60 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Todos los cobradores</option>
                {cobradoresVisibles.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="loanType">Producto (opcional)</Label>
            <select
              id="loanType"
              value={loanType}
              onChange={(e) => setLoanType((e.target.value as LoanType) || '')}
              className="flex h-10 w-full rounded-xl border border-border/60 bg-secondary/60 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Todos los productos</option>
              {(['SOLIDARIO', 'INDIVIDUAL', 'AGIL', 'FIDUCIARIO'] as LoanType[]).map((t) => (
                <option key={t} value={t}>{TIPO_LABEL[t]}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>KPIs (define al menos uno)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="metaCapitalColocado">Capital colocado ($)</Label>
              <Input
                id="metaCapitalColocado"
                type="number" min="0" step="0.01"
                placeholder="500000"
                value={metaCapitalColocado}
                onChange={(e) => setMetaCapitalColocado(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="metaCreditosColocados">Créditos colocados (#)</Label>
              <Input
                id="metaCreditosColocados"
                type="number" min="0" step="1"
                placeholder="25"
                value={metaCreditosColocados}
                onChange={(e) => setMetaCreditosColocados(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="metaCobranzaEsperada">Cobranza esperada ($)</Label>
              <Input
                id="metaCobranzaEsperada"
                type="number" min="0" step="0.01"
                placeholder="300000"
                value={metaCobranzaEsperada}
                onChange={(e) => setMetaCobranzaEsperada(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="metaCobranzaEfectiva">Cobranza efectiva ($)</Label>
              <Input
                id="metaCobranzaEfectiva"
                type="number" min="0" step="0.01"
                placeholder="285000"
                value={metaCobranzaEfectiva}
                onChange={(e) => setMetaCobranzaEfectiva(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="metaMoraMaxima">Mora máxima (%)</Label>
              <Input
                id="metaMoraMaxima"
                type="number" min="0" max="100" step="0.1"
                placeholder="5"
                value={metaMoraMaxima}
                onChange={(e) => setMetaMoraMaxima(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Tope de mora tolerada como % de la cartera.
              </p>
            </div>
            <div>
              <Label htmlFor="metaCrecimiento">Crecimiento empresa (%)</Label>
              <Input
                id="metaCrecimiento"
                type="number" step="0.1"
                placeholder="5"
                value={metaCrecimiento}
                onChange={(e) => setMetaCrecimiento(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                % de crecimiento de cartera vs semana anterior.
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="notas">Notas (opcional)</Label>
            <Input
              id="notas"
              placeholder="Comentarios para el equipo..."
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={saving}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? 'Guardando...' : initial?.id ? 'Guardar cambios' : 'Crear meta'}
        </Button>
      </div>
    </form>
  )
}
