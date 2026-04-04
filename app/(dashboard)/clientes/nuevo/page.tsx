'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import Link from 'next/link'

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
      toast({ title: 'Cliente registrado', description: form.nombreCompleto, variant: 'default' })
      router.push(`/clientes/${data.id}`)
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'No se pudo crear el cliente',
        variant: 'destructive',
      })
      setLoading(false)
    }
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
