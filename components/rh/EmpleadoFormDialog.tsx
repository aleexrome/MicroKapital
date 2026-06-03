'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, X, UserPlus, Pencil } from 'lucide-react'

export interface EmpleadoData {
  id?:                  string
  nombre:               string
  sucursal:             string | null
  estatus:              'ACTIVO' | 'BAJA'
  nacionalidad:         string | null
  edad:                 number | null
  identificacion:       string | null
  estadoCivil:          string | null
  domicilio:            string | null
  sueldo:               number | string | null  // del API llega como string (Decimal)
  base:                 string | null
  puesto:               string | null
  profesion:            string | null
  telefono:             string | null
  contactoEmergencia:   string | null
  parentesco:           string | null
  telefono2:            string | null
  fechaEntrada:         string | null  // ISO o YYYY-MM-DD
  fechaBaja:            string | null
  // Campos derivados (solo display, no se envían al PATCH).
  perfil?:              'JUNIOR' | 'EXCELENCIA' | 'SENIOR' | null
  cobranzaSemanal?:     number | null
}

interface Props {
  /** Si se pasa, el dialogo arranca en modo "Editar"; si no, en "Agregar". */
  empleado?: EmpleadoData
  /** Sucursales sugeridas para el datalist (texto libre, no obliga). */
  sucursalesSugeridas: string[]
  /** Variante visual del trigger: chip discreto en celdas de tabla, botón grande en cabecera. */
  trigger?: 'button-primary' | 'icon-ghost'
}

const VACIO: EmpleadoData = {
  nombre: '', sucursal: null, estatus: 'ACTIVO', nacionalidad: null, edad: null,
  identificacion: null, estadoCivil: null, domicilio: null, sueldo: null, base: null,
  puesto: null, profesion: null, telefono: null, contactoEmergencia: null, parentesco: null,
  telefono2: null, fechaEntrada: null, fechaBaja: null,
}

/** Convierte un Date/ISO string a YYYY-MM-DD para <input type="date">. */
function toDateInput(value: string | null): string {
  if (!value) return ''
  return value.length >= 10 ? value.slice(0, 10) : value
}

export function EmpleadoFormDialog({ empleado, sucursalesSugeridas, trigger = 'button-primary' }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const initial = empleado ?? VACIO
  const [form, setForm] = useState<EmpleadoData>(initial)

  const esEdicion = !!empleado?.id

  function reset() {
    setForm(initial)
  }

  function close() {
    if (loading) return
    setOpen(false)
    reset()
  }

  function update<K extends keyof EmpleadoData>(key: K, value: EmpleadoData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nombre || form.nombre.trim().length < 2) {
      toast({ title: 'Falta el nombre', variant: 'destructive' })
      return
    }
    setLoading(true)

    const payload = {
      nombre:             form.nombre.trim(),
      sucursal:           form.sucursal           || null,
      estatus:            form.estatus,
      nacionalidad:       form.nacionalidad       || null,
      edad:               form.edad === null || form.edad === '' as unknown ? null : Number(form.edad),
      identificacion:     form.identificacion     || null,
      estadoCivil:        form.estadoCivil        || null,
      domicilio:          form.domicilio          || null,
      sueldo:             form.sueldo === null || form.sueldo === '' ? null : Number(form.sueldo),
      base:               form.base               || null,
      puesto:             form.puesto             || null,
      profesion:          form.profesion          || null,
      telefono:           form.telefono           || null,
      contactoEmergencia: form.contactoEmergencia || null,
      parentesco:         form.parentesco         || null,
      telefono2:          form.telefono2          || null,
      // Si el campo trae aún el ISO completo del server, le pelamos los
      // primeros 10 caracteres para mandar solo YYYY-MM-DD (el endpoint
      // valida con regex y rechaza el ISO con T...Z).
      fechaEntrada:       form.fechaEntrada ? form.fechaEntrada.slice(0, 10) : null,
      fechaBaja:          form.fechaBaja    ? form.fechaBaja.slice(0, 10)    : null,
    }

    try {
      const url    = esEdicion ? `/api/empleados/${empleado!.id}` : '/api/empleados'
      const method = esEdicion ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Error al guardar')
      }
      toast({
        title: esEdicion ? 'Empleado actualizado' : 'Empleado agregado',
      })
      setOpen(false)
      router.refresh()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'No se pudo guardar',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {trigger === 'button-primary' ? (
        <Button type="button" onClick={() => setOpen(true)}>
          <UserPlus className="h-4 w-4 mr-1" />
          Agregar empleado
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          title="Editar empleado"
          onClick={() => setOpen(true)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={close}
        >
          <form
            className="w-full max-w-2xl rounded-2xl bg-card border border-border/60 shadow-card p-5 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmit}
          >
            <div className="flex items-start justify-between sticky top-0 bg-card z-10 pb-2 border-b">
              <h3 className="text-base font-semibold">
                {esEdicion ? 'Editar empleado' : 'Agregar empleado'}
              </h3>
              <button
                type="button"
                onClick={close}
                disabled={loading}
                className="text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Bloque 1: Datos básicos */}
            <Section title="Datos básicos">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Nombre completo" required>
                  <Input
                    value={form.nombre}
                    onChange={(e) => update('nombre', e.target.value)}
                    disabled={loading}
                    autoFocus
                  />
                </Field>
                <Field label="Estatus">
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
                    value={form.estatus}
                    onChange={(e) => update('estatus', e.target.value as 'ACTIVO' | 'BAJA')}
                    disabled={loading}
                  >
                    <option value="ACTIVO">Activo</option>
                    <option value="BAJA">Baja</option>
                  </select>
                </Field>
                <Field label="Sucursal">
                  <Input
                    list="empleado-sucursales"
                    value={form.sucursal ?? ''}
                    onChange={(e) => update('sucursal', e.target.value)}
                    disabled={loading}
                    placeholder="Tenancingo, Toluca, ..."
                  />
                  <datalist id="empleado-sucursales">
                    {sucursalesSugeridas.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Puesto">
                  <Input
                    value={form.puesto ?? ''}
                    onChange={(e) => update('puesto', e.target.value)}
                    disabled={loading}
                    placeholder="COORDINADOR DE CREDITO Y COBRANZA"
                  />
                </Field>
                <Field label="Profesión / Escolaridad">
                  <Input
                    value={form.profesion ?? ''}
                    onChange={(e) => update('profesion', e.target.value)}
                    disabled={loading}
                    placeholder="Licenciatura"
                  />
                </Field>
              </div>
            </Section>

            {/* Bloque 2: Personales */}
            <Section title="Datos personales">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Nacionalidad">
                  <Input
                    value={form.nacionalidad ?? ''}
                    onChange={(e) => update('nacionalidad', e.target.value)}
                    disabled={loading}
                    placeholder="Mexicana"
                  />
                </Field>
                <Field label="Edad">
                  <Input
                    type="number"
                    min={0}
                    max={120}
                    value={form.edad ?? ''}
                    onChange={(e) => update('edad', e.target.value === '' ? null : Number(e.target.value))}
                    disabled={loading}
                  />
                </Field>
                <Field label="Identificación">
                  <Input
                    value={form.identificacion ?? ''}
                    onChange={(e) => update('identificacion', e.target.value)}
                    disabled={loading}
                    placeholder="IDMEX..."
                  />
                </Field>
                <Field label="Estado civil">
                  <Input
                    value={form.estadoCivil ?? ''}
                    onChange={(e) => update('estadoCivil', e.target.value)}
                    disabled={loading}
                    placeholder="Soltero / Casado / ..."
                  />
                </Field>
                <Field label="Domicilio" wide>
                  <Input
                    value={form.domicilio ?? ''}
                    onChange={(e) => update('domicilio', e.target.value)}
                    disabled={loading}
                  />
                </Field>
              </div>
            </Section>

            {/* Bloque 3: Sueldo */}
            <Section title="Sueldo">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Sueldo (MXN)">
                  <Input
                    type="number"
                    min={0}
                    step={50}
                    value={form.sueldo ?? ''}
                    onChange={(e) => update('sueldo', e.target.value === '' ? null : Number(e.target.value))}
                    disabled={loading}
                  />
                </Field>
                <Field label="Base (monto en letras)">
                  <Input
                    value={form.base ?? ''}
                    onChange={(e) => update('base', e.target.value)}
                    disabled={loading}
                    placeholder="(DOS MIL PESOS 00/100 MN)"
                  />
                </Field>
              </div>
            </Section>

            {/* Bloque 4: Contacto */}
            <Section title="Contacto del empleado">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Teléfono">
                  <Input
                    type="tel"
                    inputMode="tel"
                    value={form.telefono ?? ''}
                    onChange={(e) => update('telefono', e.target.value)}
                    disabled={loading}
                  />
                </Field>
                <Field label="Teléfono alterno (telefono2)">
                  <Input
                    type="tel"
                    inputMode="tel"
                    value={form.telefono2 ?? ''}
                    onChange={(e) => update('telefono2', e.target.value)}
                    disabled={loading}
                  />
                </Field>
              </div>
            </Section>

            {/* Bloque 5: Contacto de emergencia */}
            <Section title="Contacto de emergencia">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Nombre del contacto">
                  <Input
                    value={form.contactoEmergencia ?? ''}
                    onChange={(e) => update('contactoEmergencia', e.target.value)}
                    disabled={loading}
                  />
                </Field>
                <Field label="Parentesco">
                  <Input
                    value={form.parentesco ?? ''}
                    onChange={(e) => update('parentesco', e.target.value)}
                    disabled={loading}
                    placeholder="Padre / Madre / Esposo / ..."
                  />
                </Field>
              </div>
            </Section>

            {/* Bloque 6: Fechas */}
            <Section title="Fechas laborales">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Fecha de entrada">
                  <Input
                    type="date"
                    value={toDateInput(form.fechaEntrada)}
                    onChange={(e) => update('fechaEntrada', e.target.value || null)}
                    disabled={loading}
                  />
                </Field>
                <Field label="Fecha de baja">
                  <Input
                    type="date"
                    value={toDateInput(form.fechaBaja)}
                    onChange={(e) => update('fechaBaja', e.target.value || null)}
                    disabled={loading}
                  />
                </Field>
              </div>
            </Section>

            <div className="flex gap-2 pt-2 border-t sticky bottom-0 bg-card">
              <Button type="button" variant="outline" className="flex-1" onClick={close} disabled={loading}>
                Cancelar
              </Button>
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                {esEdicion ? 'Guardar cambios' : 'Agregar'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</h4>
      {children}
    </div>
  )
}

function Field({ label, children, required, wide }: { label: string; children: React.ReactNode; required?: boolean; wide?: boolean }) {
  return (
    <div className={`space-y-1 ${wide ? 'sm:col-span-2' : ''}`}>
      <Label className="text-xs">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  )
}
