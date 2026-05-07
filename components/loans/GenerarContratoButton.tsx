'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, FileText, Download, Upload, CheckCircle2 } from 'lucide-react'
import { SubirContratoFirmadoDialog } from './SubirContratoFirmadoDialog'

interface ContratoExistente {
  id: string
  numeroContrato: string
  pdfGeneradoUrl: string
  loanDocumentFirmadoId?: string | null
  loanDocumentFirmadoUrl?: string | null
}

interface GenerarContratoButtonProps {
  loanId: string
  estado: string
  userRole: string
  userId: string
  loanCobradorId: string
  loanGerenteZonalIds?: string[]   // sucursales del gerente zonal del préstamo
  loanBranchId?: string
  contratoExistente?: ContratoExistente | null
}

/**
 * Botón de "Generar contrato" / "Descargar" / "Subir firmado".
 *
 * Estados visuales:
 *   - estado !== APPROVED|IN_ACTIVATION         → no muestra nada
 *   - sin contrato                              → botón "Generar contrato"
 *   - contrato sin firmar subido                → "Descargar sin firmar" + "Subir firmado"
 *   - contrato firmado ya subido                → "✓ Contrato firmado" + "Ver firmado"
 *
 * Permisos:
 *   - Generar contrato: SUPER_ADMIN, DIRECTOR_GENERAL, COORDINADOR/GERENTE_ZONAL del préstamo
 *   - Subir firmado: SOLO COORDINADOR o GERENTE_ZONAL del préstamo (no SUPER_ADMIN ni DG)
 */
export function GenerarContratoButton({
  loanId,
  estado,
  userRole,
  userId,
  loanCobradorId,
  loanGerenteZonalIds,
  loanBranchId,
  contratoExistente,
}: GenerarContratoButtonProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [generating, setGenerating] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)

  if (estado !== 'APPROVED' && estado !== 'IN_ACTIVATION') return null

  // ── Permisos ──────────────────────────────────────────────────────────────
  const esCobradorDelLoan = loanCobradorId === userId
  const esGZDelLoan =
    userRole === 'GERENTE_ZONAL' &&
    !!loanBranchId &&
    !!loanGerenteZonalIds?.includes(loanBranchId)

  const puedeGenerar =
    userRole === 'SUPER_ADMIN' ||
    userRole === 'DIRECTOR_GENERAL' ||
    esCobradorDelLoan ||
    esGZDelLoan

  const puedeSubirFirmado =
    userRole === 'SUPER_ADMIN' || esCobradorDelLoan || esGZDelLoan

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleGenerar() {
    setGenerating(true)
    try {
      const res = await fetch('/api/contracts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loanId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof body.error === 'string' ? body.error : 'Error al generar contrato')
      }
      toast({
        title: 'Contrato generado',
        description: `Folio ${body.numeroContrato}`,
      })
      // Abrir el PDF y refrescar la página para mostrar los nuevos botones
      if (body.pdfUrl) window.open(body.pdfUrl, '_blank')
      router.refresh()
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Error al generar contrato',
        variant: 'destructive',
      })
    } finally {
      setGenerating(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  // Estado 3: contrato firmado ya subido
  if (contratoExistente?.loanDocumentFirmadoId) {
    return (
      <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 text-sm space-y-1">
        <p className="text-emerald-400 font-medium flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          Contrato firmado subido — folio {contratoExistente.numeroContrato}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild size="sm" variant="outline">
            <a href={contratoExistente.pdfGeneradoUrl} target="_blank" rel="noreferrer">
              <FileText className="h-3.5 w-3.5" />
              Ver contrato sin firmar
            </a>
          </Button>
          {contratoExistente.loanDocumentFirmadoUrl && (
            <Button asChild size="sm" variant="outline">
              <a href={contratoExistente.loanDocumentFirmadoUrl} target="_blank" rel="noreferrer">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Ver contrato firmado
              </a>
            </Button>
          )}
          {puedeSubirFirmado && (
            <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}>
              <Upload className="h-3.5 w-3.5" />
              Reemplazar firmado
            </Button>
          )}
        </div>

        <SubirContratoFirmadoDialog
          contractId={contratoExistente.id}
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
        />
      </div>
    )
  }

  // Estado 2: contrato generado, pendiente de firmar
  if (contratoExistente) {
    return (
      <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-sm space-y-1">
        <p className="text-amber-300 font-medium flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Contrato generado — folio {contratoExistente.numeroContrato}
        </p>
        <p className="text-xs text-muted-foreground">
          Imprime el contrato, hazlo firmar por el cliente y sube la versión firmada.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild size="sm" variant="outline">
            <a href={contratoExistente.pdfGeneradoUrl} target="_blank" rel="noreferrer">
              <Download className="h-3.5 w-3.5" />
              Descargar contrato sin firmar
            </a>
          </Button>
          {puedeSubirFirmado && (
            <Button size="sm" onClick={() => setUploadOpen(true)}>
              <Upload className="h-3.5 w-3.5" />
              Subir contrato firmado
            </Button>
          )}
        </div>

        <SubirContratoFirmadoDialog
          contractId={contratoExistente.id}
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
        />
      </div>
    )
  }

  // Estado 1: sin contrato
  if (!puedeGenerar) return null

  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={handleGenerar} disabled={generating}>
        {generating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Generando…
          </>
        ) : (
          <>
            <FileText className="h-4 w-4" />
            Generar contrato
          </>
        )}
      </Button>
    </div>
  )
}
