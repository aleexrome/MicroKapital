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

interface Branch {
  id: string
  nombre: string
}

export function NuevoClienteForm({
  isDirector,
  branches,
}: {
  isDirector: boolean
  branches: Branch[]
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  // El nombre se captura en 3 campos (Nombres, Apellido paterno, Apellido
  // materno) para forzar consistencia en el orden — antes venia un solo
  // campo libre y cada capturista lo escribia distinto. Al enviar se
  // concatena a `nombreCompleto` que sigue siendo la columna en BD.
  const [form, setForm] = useState({
    nombres: '',
    apellidoPaterno: '',
    apellidoMaterno: '',
    telefono: '',
    telefonoAlt: '',
    email: '',
    // Domicilio descompuesto — se envía por subcampos y el backend arma
    // el `domicilio` libre para retro-compat (contratos y prints viejos).
    domicilioCalle: '',
    domicilioNumExt: '',
    domicilioNumInt: '',
    domicilioColonia: '',
    domicilioMunicipio: '',
    domicilioEstado: '',
    domicilioCP: '',
    numIne: '',
    curp: '',
    referenciaNombre: '',
    referenciaTelefono: '',
    fechaNacimiento: '',
    branchId: '',
  })

  // Campos que se fuerzan a MAYÚSCULAS en tiempo real al teclear — así el
  // capturista ve de inmediato cómo queda el registro y no importa si tiene
  // activadas minúsculas en el teclado.
  const UPPER_FIELDS = new Set([
    'nombres', 'apellidoPaterno', 'apellidoMaterno',
    'domicilioCalle', 'domicilioNumInt', 'domicilioColonia',
    'domicilioMunicipio', 'domicilioEstado',
    'referenciaNombre', 'numIne', 'curp',
  ])

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target
    const normalized = UPPER_FIELDS.has(name) ? value.toUpperCase() : value
    setForm((prev) => ({ ...prev, [name]: normalized }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (isDirector && !form.branchId) {
      toast({
        title: 'Sucursal requerida',
        description: 'Como Director debes indicar a qué sucursal pertenece el cliente',
        variant: 'destructive',
      })
      return
    }

    // Concatenar Nombres + Apellido Paterno + Apellido Materno con un
    // espacio (colapsa espacios repetidos si un campo está vacío).
    const nombreCompleto = [form.nombres, form.apellidoPaterno, form.apellidoMaterno]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(' ')
      .toUpperCase()

    if (!form.nombres.trim() || !form.apellidoPaterno.trim()) {
      toast({
        title: 'Nombre incompleto',
        description: 'Captura al menos los nombres y el apellido paterno.',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)

    try {
      // Mandamos nombreCompleto (concatenado, retro-compat) + los
      // subcampos que ya se guardan por separado en BD. Igual con el
      // domicilio: mandamos los 7 subcampos y el backend arma el string.
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          nombreCompleto,
          // No mandamos branchId vacío — el API lo deduce del usuario.
          branchId: form.branchId || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const msg =
          typeof data?.error === 'string'
            ? data.error
            : 'Error al crear cliente'
        throw new Error(msg)
      }

      const { data } = await res.json()
      toast({ title: 'Cliente registrado', description: nombreCompleto })
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
        {/* Selector de sucursal — solo visible para Directores */}
        {isDirector && (
          <Card>
            <CardHeader><CardTitle className="text-base">Sucursal</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="branchId">Sucursal de alta *</Label>
                <select
                  id="branchId"
                  name="branchId"
                  value={form.branchId}
                  onChange={handleChange}
                  required
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">— Selecciona la sucursal —</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.nombre}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Después el coordinador o gerente de esa sucursal podrá elegir este cliente
                  al crear una solicitud de crédito.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Datos personales</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 space-y-2">
              <Label htmlFor="nombres">Nombre(s) *</Label>
              <Input
                id="nombres"
                name="nombres"
                value={form.nombres}
                onChange={handleChange}
                required
                placeholder="MARÍA DEL CARMEN"
                autoCapitalize="characters"
                style={{ textTransform: 'uppercase' }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apellidoPaterno">Apellido paterno *</Label>
              <Input
                id="apellidoPaterno"
                name="apellidoPaterno"
                value={form.apellidoPaterno}
                onChange={handleChange}
                required
                placeholder="ALTAMIRANO"
                autoCapitalize="characters"
                style={{ textTransform: 'uppercase' }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apellidoMaterno">Apellido materno</Label>
              <Input
                id="apellidoMaterno"
                name="apellidoMaterno"
                value={form.apellidoMaterno}
                onChange={handleChange}
                placeholder="ANDRADE"
                autoCapitalize="characters"
                style={{ textTransform: 'uppercase' }}
              />
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
            {/* Domicilio descompuesto — DG y coord capturan campo a campo
                para poder reportar por colonia / municipio / CP. El
                backend re-arma el string libre para contratos viejos. */}
            <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-6 gap-3">
              <div className="sm:col-span-4 space-y-2">
                <Label htmlFor="domicilioCalle">Calle</Label>
                <Input id="domicilioCalle" name="domicilioCalle" value={form.domicilioCalle} onChange={handleChange} placeholder="Av. Reforma" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="domicilioNumExt">No. Ext.</Label>
                <Input id="domicilioNumExt" name="domicilioNumExt" value={form.domicilioNumExt} onChange={handleChange} placeholder="123" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="domicilioNumInt">No. Int.</Label>
                <Input id="domicilioNumInt" name="domicilioNumInt" value={form.domicilioNumInt} onChange={handleChange} placeholder="4" />
              </div>
              <div className="sm:col-span-3 space-y-2">
                <Label htmlFor="domicilioColonia">Colonia</Label>
                <Input id="domicilioColonia" name="domicilioColonia" value={form.domicilioColonia} onChange={handleChange} placeholder="Centro" />
              </div>
              <div className="sm:col-span-3 space-y-2">
                <Label htmlFor="domicilioMunicipio">Municipio / Alcaldía</Label>
                <Input id="domicilioMunicipio" name="domicilioMunicipio" value={form.domicilioMunicipio} onChange={handleChange} placeholder="Toluca" />
              </div>
              <div className="sm:col-span-4 space-y-2">
                <Label htmlFor="domicilioEstado">Estado</Label>
                <Input id="domicilioEstado" name="domicilioEstado" value={form.domicilioEstado} onChange={handleChange} placeholder="México" />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="domicilioCP">CP</Label>
                <Input id="domicilioCP" name="domicilioCP" value={form.domicilioCP} onChange={handleChange} placeholder="50000" inputMode="numeric" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Identificación</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="numIne">Número de INE</Label>
              <Input
                id="numIne"
                name="numIne"
                value={form.numIne}
                onChange={handleChange}
                placeholder="IDMEX..."
                autoCapitalize="characters"
                style={{ textTransform: 'uppercase' }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="curp">CURP</Label>
              <Input
                id="curp"
                name="curp"
                value={form.curp}
                onChange={handleChange}
                placeholder="XAXX010101HNESBX09"
                maxLength={18}
                autoCapitalize="characters"
                style={{ textTransform: 'uppercase' }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Referencia</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="referenciaNombre">Nombre de referencia</Label>
              <Input
                id="referenciaNombre"
                name="referenciaNombre"
                value={form.referenciaNombre}
                onChange={handleChange}
                placeholder="NOMBRE DE FAMILIAR O AMIGO"
                autoCapitalize="characters"
                style={{ textTransform: 'uppercase' }}
              />
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
