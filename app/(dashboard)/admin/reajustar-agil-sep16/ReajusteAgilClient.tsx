'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, AlertTriangle, CheckCircle2, Play } from 'lucide-react'

interface PreviewRow {
  scheduleId: string
  loanId: string
  numeroPago: number
  fechaAnterior: string
  fechaNueva: string
}

interface PreviewResult {
  dryRun: boolean
  loansAfectados: number
  schedulesAfectados: number
  preview?: PreviewRow[]
  note?: string
}

export function ReajusteAgilClient() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [applied, setApplied] = useState<PreviewResult | null>(null)

  async function runPreview() {
    setLoading(true)
    setPreview(null)
    setApplied(null)
    try {
      const res = await fetch('/api/admin/reajustar-agil-sep16?dry=1', { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Error')
      setPreview(await res.json())
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  async function applyChanges() {
    if (!confirm('¿Aplicar los cambios? Se van a actualizar las fechas de los schedules mostrados. Los pagos ya cobrados NO se tocan.')) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/reajustar-agil-sep16?dry=0', { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Error')
      const data: PreviewResult = await res.json()
      setApplied(data)
      toast({ title: '✅ Cambios aplicados', description: `${data.schedulesAfectados} schedules actualizados en ${data.loansAfectados} créditos.` })
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reajustar créditos Ágil — 16 septiembre 2026</h1>
        <p className="text-sm text-muted-foreground">
          Herramienta correctiva de una sola vez. Recalcula el calendario de los créditos Ágil vigentes que
          se generaron con 16-sep marcado como inhábil. Los schedules ya cobrados (PAID / ADVANCE /
          FINANCIADO) NO se tocan; solo se ajustan los pendientes.
        </p>
      </div>

      <Card className="border-amber-500/50 bg-amber-500/5">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-amber-500">Flujo recomendado</p>
            <p className="text-muted-foreground mt-1">
              1. <strong>Vista previa</strong> — muestra cuántos créditos y schedules se van a mover, sin escribir a BD.<br />
              2. Revisas y confirmas los números.<br />
              3. <strong>Aplicar cambios</strong> — hace el update en una transacción y queda auditado.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button onClick={runPreview} disabled={loading} variant="outline">
          {loading && !applied
            ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Calculando...</>
            : <><Play className="h-4 w-4 mr-2" /> Vista previa (dry-run)</>}
        </Button>
        <Button
          onClick={applyChanges}
          disabled={loading || !preview || preview.schedulesAfectados === 0 || !!applied}
          variant="destructive"
        >
          {loading && preview
            ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Aplicando...</>
            : 'Aplicar cambios'}
        </Button>
      </div>

      {preview && !applied && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Vista previa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-6 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Créditos a ajustar</p>
                <p className="text-2xl font-bold">{preview.loansAfectados}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Schedules a mover</p>
                <p className="text-2xl font-bold">{preview.schedulesAfectados}</p>
              </div>
            </div>
            {preview.preview && preview.preview.length > 0 ? (
              <div className="overflow-x-auto -mx-2 sm:mx-0">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground border-b">
                    <tr>
                      <th className="text-left py-2 px-2 font-medium">Loan ID</th>
                      <th className="text-left py-2 px-2 font-medium">Pago #</th>
                      <th className="text-left py-2 px-2 font-medium">Fecha anterior</th>
                      <th className="text-left py-2 px-2 font-medium">Fecha nueva</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.preview.map((r) => (
                      <tr key={r.scheduleId} className="border-b last:border-0">
                        <td className="py-1.5 px-2 font-mono truncate max-w-[200px]">{r.loanId}</td>
                        <td className="py-1.5 px-2">{r.numeroPago}</td>
                        <td className="py-1.5 px-2 text-red-500">{r.fechaAnterior}</td>
                        <td className="py-1.5 px-2 text-green-500">{r.fechaNueva}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.schedulesAfectados > (preview.preview.length ?? 0) && (
                  <p className="text-xs text-muted-foreground mt-2 italic">
                    Se muestran los primeros {preview.preview.length} de {preview.schedulesAfectados} schedules. El botón "Aplicar cambios" los procesa todos.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No hay créditos Ágil afectados. La operación está en línea con el nuevo calendario.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {applied && (
        <Card className="border-green-500/50 bg-green-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-green-500">Cambios aplicados</p>
              <p className="text-muted-foreground mt-1">
                {applied.schedulesAfectados} schedules actualizados en {applied.loansAfectados} créditos.
                Queda registrado en AuditLog con acción REAJUSTE_AGIL_SEP16.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
