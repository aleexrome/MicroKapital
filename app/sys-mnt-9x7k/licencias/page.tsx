'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { formatMoney, formatDate } from '@/lib/utils'
import { Loader2, ToggleLeft, ToggleRight, RefreshCw } from 'lucide-react'

interface LicenseRecord {
  id: string
  companyId: string
  claveLicencia: string
  estado: string
  precioMensual: string
  diaCobro: number
  proximoPago: string
  notasInternas: string | null
  ultimaVerificacion: string
  company: { nombre: string }
}

const ESTADOS = ['ACTIVE', 'GRACE', 'SUSPENDED', 'CANCELLED'] as const
const ESTADO_LABELS: Record<string, string> = {
  ACTIVE: 'Activa',
  GRACE: 'Gracia',
  SUSPENDED: 'Suspendida',
  CANCELLED: 'Cancelada',
}
const ESTADO_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'secondary'> = {
  ACTIVE: 'success',
  GRACE: 'warning',
  SUSPENDED: 'error',
  CANCELLED: 'secondary',
}

export default function LicenciasPage() {
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const filterCompanyId = searchParams.get('companyId')

  const [licenses, setLicenses] = useState<LicenseRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  async function loadLicenses() {
    const url = filterCompanyId
      ? `/api/admin/licenses?companyId=${filterCompanyId}`
      : '/api/admin/licenses'
    const res = await fetch(url)
    const data = await res.json()
    setLicenses(data.data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadLicenses() }, [filterCompanyId])

  async function updateEstado(licenseId: string, nuevoEstado: string) {
    setUpdating(licenseId)
    try {
      const res = await fetch(`/api/admin/licenses/${licenseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado }),
      })
      if (!res.ok) throw new Error('Error al actualizar')
      toast({ title: `✅ Licencia actualizada → ${ESTADO_LABELS[nuevoEstado]}` })
      loadLicenses()
    } catch (err) {
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' })
    } finally {
      setUpdating(null)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Gestión de licencias</h1>
          <p className="text-gray-400 text-sm">{licenses.length} licencia(s)</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadLicenses} className="text-gray-300 border-gray-600">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-yellow-400" />
        </div>
      ) : (
        <div className="space-y-4">
          {licenses.map((lic) => (
            <div key={lic.id} className="bg-gray-800 rounded-lg p-5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="font-semibold text-white">{lic.company.nombre}</h3>
                  <p className="text-sm text-gray-400 font-mono">{lic.claveLicencia}</p>
                  <div className="flex gap-3 mt-2 text-xs text-gray-400">
                    <span>{formatMoney(Number(lic.precioMensual))}/mes</span>
                    <span>Próximo: {formatDate(lic.proximoPago)}</span>
                    <span>Día de cobro: {lic.diaCobro}</span>
                  </div>
                  {lic.notasInternas && (
                    <p className="text-xs text-gray-500 mt-1 italic">{lic.notasInternas}</p>
                  )}
                </div>
                <Badge variant={ESTADO_VARIANT[lic.estado]} className="flex-shrink-0">
                  {ESTADO_LABELS[lic.estado] ?? lic.estado}
                </Badge>
              </div>

              {/* Botones de cambio de estado */}
              <div className="flex flex-wrap gap-2">
                {ESTADOS.filter((e) => e !== lic.estado).map((nuevoEstado) => (
                  <Button
                    key={nuevoEstado}
                    size="sm"
                    variant={nuevoEstado === 'SUSPENDED' || nuevoEstado === 'CANCELLED' ? 'destructive' : 'outline'}
                    disabled={!!updating}
                    onClick={() => updateEstado(lic.id, nuevoEstado)}
                    className={`text-xs ${nuevoEstado === 'ACTIVE' ? 'text-green-400 border-green-600 hover:bg-green-900' : nuevoEstado === 'GRACE' ? 'text-yellow-400 border-yellow-600 hover:bg-yellow-900' : ''}`}
                  >
                    {updating === lic.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      `→ ${ESTADO_LABELS[nuevoEstado]}`
                    )}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
