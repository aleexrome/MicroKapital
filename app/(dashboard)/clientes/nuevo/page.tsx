'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { ArrowLeft, Loader2, Save, ShieldAlert, AlertTriangle, Info } from 'lucide-react'
import Link from 'next/link'

interface AvalMatchItem {
  loanId: string
  loanEstado: string
  loanTipo: string
  capital: number
  clienteNombre: string
  clienteScore: number
  scoreColor: string
  scoreLabel: string
  matchType: string
}

const ESTADO_LABELS: Record<string, string> = {
  ACTIVE: 'Activo',
  PENDING_APPROVAL: 'Pendiente',
  DEFAULTED: 'Incumplido',
  RESTRUCTURED: 'Reestructurado',
}

export default function NuevoClientePage() {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const [form, setForm] = useState({
    nombreCompleto: '',
    telefono: '',
    telefonoAlt: '',
    email: '',
    domicilio: '',
    numIne: '',
    curp: '',
    referenciaNombre: '',
    referenciaTelefono: '',
    fechaNacimiento: '',
  })

  // Aval check state — shown after successful save
  const [avalMatches, setAvalMatches] = useState<AvalMatchItem[]>([])
  const [avalRiskLevel, setAvalRiskLevel] = useState<string | null>(null)
  const [savedClientId, setSavedClientId] = useState<string | null>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Error al crear cliente')
      }

      const { data } = await res.json()

      // Check if this new client is an aval of someone
      let foundMatches = false
      try {
        const params = new URLSearchParams({ nombre: form.nombreCompleto })
        if (form.telefono) params.set('telefono', form.telefono)
        const avalRes = await fetch(`/api/aval-check?${params}`)
        if (avalRes.ok) {
          const { data: avalData } = await avalRes.json()
          if (avalData.matches?.length > 0) {
            setAvalMatches(avalData.matches)
            setAvalRiskLevel(avalData.riskLevel)
            setSavedClientId(data.id)
            foundMatches = true
          }
        }
      } catch {
        // ignore aval check errors
      }

      toast({ title: 'Cliente registrado', description: form.nombreCompleto, variant: 'default' })

      // If no aval matches, redirect immediately to the client's page
      if (!foundMatches) {
        router.push(`/clientes/${data.id}`)
      }
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'No se pudo crear el cliente',
        variant: 'destructive',
      })
      setLoading(false)
    }
  }

  // If we saved and found aval matches, show the alert with a "Continue" button
  if (savedClientId && avalMatches.length > 0) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cliente registrado</h1>
          <p className="text-muted-foreground">{form.nombreCompleto} fue dado de alta exitosamente</p>
        </div>

        <Card className={
          avalRiskLevel === 'red'
            ? 'border-red-400 bg-red-50'
            : avalRiskLevel === 'yellow'
            ? 'border-yellow-400 bg-yellow-50'
            : 'border-blue-300 bg-blue-50'
        }>
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              {avalRiskLevel === 'red' ? (
                <ShieldAlert className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
              ) : avalRiskLevel === 'yellow' ? (
                <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
              ) : (
                <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1">
                <p className={`font-semibold ${
                  avalRiskLevel === 'red' ? 'text-red-800' : avalRiskLevel === 'yellow' ? 'text-yellow-800' : 'text-blue-800'
                }`}>
                  Esta persona aparece como aval en {avalMatches.length} préstamo(s)
                </p>
                <div className="mt-3 space-y-2">
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
                <p className="text-sm mt-3 text-muted-foreground">
                  Toma esto en cuenta al momento de evaluar solicitudes de crédito para este cliente.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button asChild>
          <Link href={`/clientes/${savedClientId}`}>Ver expediente del cliente</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/clientes"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nuevo cliente</h1>
          <p className="text-muted-foreground">Alta de expediente</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Datos personales</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 space-y-2">
              <Label htmlFor="nombreCompleto">Nombre completo *</Label>
              <Input id="nombreCompleto" name="nombreCompleto" value={form.nombreCompleto} onChange={handleChange} required placeholder="Nombre y apellidos" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefono">Teléfono</Label>
              <Input id="telefono" name="telefono" value={form.telefono} onChange={handleChange} placeholder="555-0000" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefonoAlt">Teléfono alternativo</Label>
              <Input id="telefonoAlt" name="telefonoAlt" value={form.telefonoAlt} onChange={handleChange} placeholder="555-0001" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input id="email" name="email" type="email" value={form.email} onChange={handleChange} placeholder="cliente@email.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fechaNacimiento">Fecha de nacimiento</Label>
              <Input id="fechaNacimiento" name="fechaNacimiento" type="date" value={form.fechaNacimiento} onChange={handleChange} />
            </div>
            <div className="sm:col-span-2 space-y-2">
              <Label htmlFor="domicilio">Domicilio</Label>
              <Input id="domicilio" name="domicilio" value={form.domicilio} onChange={handleChange} placeholder="Calle, número, colonia, municipio" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Identificación</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="numIne">Número de INE</Label>
              <Input id="numIne" name="numIne" value={form.numIne} onChange={handleChange} placeholder="IDMEX..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="curp">CURP</Label>
              <Input id="curp" name="curp" value={form.curp} onChange={handleChange} placeholder="XAXX010101HNESBX09" maxLength={18} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Referencia</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="referenciaNombre">Nombre de referencia</Label>
              <Input id="referenciaNombre" name="referenciaNombre" value={form.referenciaNombre} onChange={handleChange} placeholder="Nombre de familiar o amigo" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="referenciaTelefono">Teléfono de referencia</Label>
              <Input id="referenciaTelefono" name="referenciaTelefono" value={form.referenciaTelefono} onChange={handleChange} placeholder="555-0002" />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={loading} className="flex-1 sm:flex-none">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</> : <><Save className="h-4 w-4" /> Guardar cliente</>}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/clientes">Cancelar</Link>
          </Button>
        </div>
      </form>
    </div>
  )
}
