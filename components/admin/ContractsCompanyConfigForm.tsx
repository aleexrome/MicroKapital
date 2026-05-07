'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { Loader2 } from 'lucide-react'

interface CompanyConfigData {
  representanteLegal: string
  cat: number
  interesMoratorio: number
}

interface Props {
  initialData: CompanyConfigData | null
}

export function ContractsCompanyConfigForm({ initialData }: Props) {
  const { toast } = useToast()
  const [representanteLegal, setRepresentanteLegal] = useState(initialData?.representanteLegal ?? '')
  const [cat, setCat] = useState(initialData?.cat?.toString() ?? '100.00')
  const [interesMoratorio, setInteresMoratorio] = useState(
    initialData?.interesMoratorio?.toString() ?? '10.00'
  )
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/admin/contracts/company-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          representanteLegal: representanteLegal.trim(),
          cat: Number(cat),
          interesMoratorio: Number(interesMoratorio),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(typeof body.error === 'string' ? body.error : 'Error al guardar')
      }
      toast({ title: 'Configuración de empresa guardada' })
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Error',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
      <div className="space-y-1.5">
        <Label htmlFor="representanteLegal">Representante legal</Label>
        <Input
          id="representanteLegal"
          type="text"
          value={representanteLegal}
          onChange={(e) => setRepresentanteLegal(e.target.value)}
          placeholder="Nombre completo del representante legal"
          required
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="cat">CAT (%)</Label>
          <Input
            id="cat"
            type="number"
            step="0.01"
            min="0"
            max="999.99"
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            placeholder="100.00"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="interesMoratorio">Interés moratorio (%)</Label>
          <Input
            id="interesMoratorio"
            type="number"
            step="0.01"
            min="0"
            max="999.99"
            value={interesMoratorio}
            onChange={(e) => setInteresMoratorio(e.target.value)}
            placeholder="10.00"
            required
          />
        </div>
      </div>

      <div className="pt-2">
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Guardar configuración de empresa
        </Button>
      </div>
    </form>
  )
}
