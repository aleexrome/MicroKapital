'use client'

import { useState } from 'react'
import { CheckCircle2, Clock, Circle, FileText, Banknote, Camera, Undo2, XOctagon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SubirContratoFirmadoDialog } from './SubirContratoFirmadoDialog'
import { RegistrarPagoDialog } from './RegistrarPagoDialog'
import { CapturarFotoDesembolsoDialog } from './CapturarFotoDesembolsoDialog'
import { CancelarActivacionDialog } from './CancelarActivacionDialog'
import { ConfirmarAtrasDialog } from './ConfirmarAtrasDialog'
import { VolverAtrasDialog } from './VolverAtrasDialog'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/use-toast'
import { Loader2 } from 'lucide-react'

interface ContratoExistente {
  id: string
  numeroContrato: string
  pdfGeneradoUrl: string
  loanDocumentFirmadoId?: string | null
  loanDocumentFirmadoUrl?: string | null
}

interface EstadoFlujoActivacionProps {
  loanId: string
  loanEstado: string                   // PENDING_APPROVAL | APPROVED | IN_ACTIVATION | ACTIVE | DECLINED | ...
  contratoFirmadoSubido: boolean
  seguroPagado: boolean                // Payment de comisión vigente (canceledAt null)
  seguroPendienteTransfer: boolean     // loan.seguroPendiente — TRANSFER en espera de verificación
  fotoDesembolsoSubida: boolean
  contrato: ContratoExistente | null

  // Datos para los modales
  feeConcepto: 'SEGURO' | 'COMISION'
  feeMonto: number
  capital: number
  descuentoRenovacion?: number

  // Permisos
  userRole: string
  userId: string
  loanCobradorId: string
  loanGerenteZonalIds?: string[]
  loanBranchId: string
}

type ChipStatus = 'OK' | 'PENDING' | 'PENDING_TRANSFER' | 'LATER'

/**
 * Sección "Estado del flujo" — 3 candados secuenciales del proceso de
 * activación. Refactor completo de Fase 6b: ahora es interactivo cuando
 * el préstamo está en IN_ACTIVATION.
 *
 * Comportamiento por estado:
 *   - APPROVED         → 3 chips LATER (sólo informativos). Los botones
 *                         "Comenzar activación" y "Cliente no acepta"
 *                         viven en la página, fuera del componente.
 *   - IN_ACTIVATION    → secuencial e interactivo. Cada chip activo (🟡)
 *                         expone su botón principal. Los chips cumplidos
 *                         (🟢) exponen "Atrás" si el siguiente no se ha
 *                         cumplido. Footer con "Cancelar activación".
 *   - ACTIVE           → 3 chips OK (historial visual del flujo completo).
 *   - DECLINED         → 3 chips LATER, banner de cancelado.
 */
export function EstadoFlujoActivacion(props: EstadoFlujoActivacionProps) {
  const {
    loanId, loanEstado,
    contratoFirmadoSubido, seguroPagado, seguroPendienteTransfer, fotoDesembolsoSubida,
    contrato,
    feeConcepto, feeMonto, capital, descuentoRenovacion = 0,
    userRole, userId, loanCobradorId, loanGerenteZonalIds, loanBranchId,
  } = props

  const router = useRouter()
  const { toast } = useToast()

  const [generating, setGenerating] = useState(false)
  const [openSubir, setOpenSubir] = useState(false)
  const [openPago, setOpenPago] = useState(false)
  const [openFoto, setOpenFoto] = useState(false)
  const [openCancelar, setOpenCancelar] = useState(false)
  const [openVolverAtras, setOpenVolverAtras] = useState(false)
  const [openAtrasContrato, setOpenAtrasContrato] = useState(false)
  const [openAtrasPago, setOpenAtrasPago] = useState(false)

  // ── Permisos ──────────────────────────────────────────────────────────────
  const esCobradorDelLoan = loanCobradorId === userId
  const esGZDelLoan =
    userRole === 'GERENTE_ZONAL' &&
    !!loanGerenteZonalIds?.includes(loanBranchId)
  const puedeActuar =
    userRole === 'SUPER_ADMIN' || esCobradorDelLoan || esGZDelLoan

  const isInActivation = loanEstado === 'IN_ACTIVATION'
  const isDeclined     = loanEstado === 'DECLINED'

  // ── Estado visual de cada chip ────────────────────────────────────────────
  const chip1Status: ChipStatus = (() => {
    if (contratoFirmadoSubido) return 'OK'
    if (isInActivation) return 'PENDING'
    return 'LATER'
  })()

  const chip2Status: ChipStatus = (() => {
    if (seguroPagado && !seguroPendienteTransfer) return 'OK'
    if (seguroPendienteTransfer) return 'PENDING_TRANSFER'
    if (isInActivation && contratoFirmadoSubido) return 'PENDING'
    return 'LATER'
  })()

  const chip3Status: ChipStatus = (() => {
    if (fotoDesembolsoSubida) return 'OK'
    if (isInActivation && contratoFirmadoSubido && seguroPagado && !seguroPendienteTransfer) return 'PENDING'
    return 'LATER'
  })()

  // Botón "Atrás" sólo si el chip está OK y el siguiente NO está OK y estamos en IN_ACTIVATION
  const showAtrasContrato = isInActivation && chip1Status === 'OK' && chip2Status !== 'OK' && chip2Status !== 'PENDING_TRANSFER' && puedeActuar
  const showAtrasPago     = isInActivation && chip2Status === 'OK' && chip3Status !== 'OK' && puedeActuar

  // Cuántos chips cumplidos para la barra de progreso
  const cumplidos = [chip1Status, chip2Status, chip3Status].filter((s) => s === 'OK').length

  // Footer condicional:
  //  - Sin avance: botón "Volver atrás" (regresa a APPROVED, sin razón)
  //  - Con avance parcial: botón "Cancelar activación" (DECLINED, con razón obligatoria)
  // El chip 2 PENDING_TRANSFER cuenta como "con avance" porque ya se intentó cobrar
  // y deshacer requiere cancelar el Payment vía /cancel-activation.
  const hayAvance =
    chip1Status === 'OK' || chip2Status === 'OK' || chip2Status === 'PENDING_TRANSFER' || chip3Status === 'OK'
  const showVolverAtras = isInActivation && !hayAvance && puedeActuar
  const showCancelarActivacion = isInActivation && hayAvance && chip3Status !== 'OK' && puedeActuar

  // ── Acción del chip 1: generar contrato → subir firmado ──────────────────
  async function handleGenerarContrato() {
    setGenerating(true)
    try {
      const res = await fetch('/api/contracts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loanId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Error al generar contrato')
      }
      toast({
        title: 'Contrato generado',
        description: `Folio ${data.numeroContrato}. Imprime, firma con el cliente y sube la versión firmada.`,
      })
      if (data.pdfUrl) window.open(data.pdfUrl, '_blank')
      router.refresh()
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Error',
        variant: 'destructive',
      })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-4">
      {/* ── Header con barra de progreso ────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Estado del flujo</h3>
          <span className="text-xs text-muted-foreground tabular-nums">
            Paso {cumplidos} de 3
          </span>
        </div>
        <ProgressBar cumplidos={cumplidos} total={3} declined={isDeclined} />
        {isDeclined && (
          <p className="mt-2 text-xs text-red-400">
            Activación cancelada — el préstamo quedó en estado <strong>Cancelado</strong>.
          </p>
        )}
      </div>

      {/* ── Chip 1 — Contrato firmado ───────────────────────────────────── */}
      <Chip
        status={chip1Status}
        title="Contrato firmado por el cliente"
        subtitle={chip1Subtitle(chip1Status, contrato)}
        accion={
          chip1Status === 'PENDING' && puedeActuar ? (
            <div className="flex flex-wrap gap-2">
              {!contrato && (
                <Button size="sm" onClick={handleGenerarContrato} disabled={generating}>
                  {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                  Generar contrato
                </Button>
              )}
              {contrato && !contrato.loanDocumentFirmadoId && (
                <>
                  <Button size="sm" variant="outline" asChild>
                    <a href={contrato.pdfGeneradoUrl} target="_blank" rel="noreferrer">
                      <FileText className="h-3.5 w-3.5" />
                      Descargar sin firmar
                    </a>
                  </Button>
                  <Button size="sm" onClick={() => setOpenSubir(true)}>
                    Subir firmado
                  </Button>
                </>
              )}
            </div>
          ) : null
        }
        atras={
          showAtrasContrato ? (
            <Button size="sm" variant="ghost" onClick={() => setOpenAtrasContrato(true)}>
              <Undo2 className="h-3 w-3" />
              Atrás
            </Button>
          ) : null
        }
        viewLink={
          chip1Status === 'OK' && contrato
            ? { href: contrato.loanDocumentFirmadoUrl ?? contrato.pdfGeneradoUrl, label: 'Ver contrato' }
            : null
        }
      />

      {/* ── Chip 2 — Pago de comisión / seguro ──────────────────────────── */}
      <Chip
        status={chip2Status}
        title={feeConcepto === 'SEGURO' ? 'Pago de seguro de apertura' : 'Pago de comisión de apertura'}
        subtitle={chip2Subtitle(chip2Status)}
        accion={
          chip2Status === 'PENDING' && puedeActuar ? (
            <Button size="sm" onClick={() => setOpenPago(true)}>
              <Banknote className="h-3.5 w-3.5" />
              Registrar pago
            </Button>
          ) : null
        }
        atras={
          showAtrasPago ? (
            <Button size="sm" variant="ghost" onClick={() => setOpenAtrasPago(true)}>
              <Undo2 className="h-3 w-3" />
              Atrás
            </Button>
          ) : null
        }
      />

      {/* ── Chip 3 — Foto del desembolso con GPS ────────────────────────── */}
      <Chip
        status={chip3Status}
        title="Foto del desembolso con GPS"
        subtitle={chip3Subtitle(chip3Status)}
        accion={
          chip3Status === 'PENDING' && puedeActuar ? (
            <Button size="sm" onClick={() => setOpenFoto(true)}>
              <Camera className="h-3.5 w-3.5" />
              Capturar foto
            </Button>
          ) : null
        }
        atras={null}  // Chip 3 es irrevocable: subir la foto activa el préstamo
      />

      {/* ── Footer: "Volver atrás" o "Cancelar activación" según avance ── */}
      {(showVolverAtras || showCancelarActivacion) && (
        <div className="pt-2 border-t border-border/40">
          {showVolverAtras && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setOpenVolverAtras(true)}
              className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Volver atrás
            </Button>
          )}
          {showCancelarActivacion && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setOpenCancelar(true)}
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
            >
              <XOctagon className="h-3.5 w-3.5" />
              Cancelar activación
            </Button>
          )}
        </div>
      )}

      {/* ── Modales ─────────────────────────────────────────────────────── */}
      {contrato && (
        <SubirContratoFirmadoDialog
          contractId={contrato.id}
          open={openSubir}
          onClose={() => setOpenSubir(false)}
        />
      )}

      <RegistrarPagoDialog
        loanId={loanId}
        open={openPago}
        onClose={() => setOpenPago(false)}
        feeConcepto={feeConcepto}
        feeMonto={feeMonto}
        capital={capital}
        descuentoRenovacion={descuentoRenovacion}
      />

      <CapturarFotoDesembolsoDialog
        loanId={loanId}
        open={openFoto}
        onClose={() => setOpenFoto(false)}
      />

      <CancelarActivacionDialog
        loanId={loanId}
        open={openCancelar}
        onClose={() => setOpenCancelar(false)}
      />

      <VolverAtrasDialog
        loanId={loanId}
        open={openVolverAtras}
        onClose={() => setOpenVolverAtras(false)}
      />

      {contrato && (
        <ConfirmarAtrasDialog
          open={openAtrasContrato}
          onClose={() => setOpenAtrasContrato(false)}
          title="Eliminar contrato firmado"
          message="Esto eliminará el contrato firmado subido. ¿Continuar?"
          endpoint={`/api/contracts/${contrato.id}/remove-signed`}
          confirmLabel="Sí, eliminar"
          successMessage="Contrato firmado eliminado"
        />
      )}

      <ConfirmarAtrasDialog
        open={openAtrasPago}
        onClose={() => setOpenAtrasPago(false)}
        title="Cancelar pago de comisión"
        message="Esto cancelará el pago registrado de la comisión. ¿Continuar?"
        endpoint={`/api/loans/${loanId}/cancel-payment`}
        confirmLabel="Sí, cancelar pago"
        successMessage="Pago de comisión cancelado"
      />
    </div>
  )
}

// ─── Sub-componentes ───────────────────────────────────────────────────────

function ProgressBar({ cumplidos, total, declined }: { cumplidos: number; total: number; declined: boolean }) {
  const pct = total === 0 ? 0 : Math.round((cumplidos / total) * 100)
  return (
    <div className="h-2 bg-secondary/50 rounded-full overflow-hidden">
      <div
        className={`h-full transition-all duration-300 ${declined ? 'bg-red-500/60' : 'bg-emerald-500'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

interface ChipProps {
  status: ChipStatus
  title: string
  subtitle: string
  accion: React.ReactNode
  atras: React.ReactNode
  viewLink?: { href: string; label: string } | null
}

function Chip({ status, title, subtitle, accion, atras, viewLink }: ChipProps) {
  const styles = STATUS_STYLES[status]
  const Icon = styles.Icon
  return (
    <div className="flex items-start gap-3">
      <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${styles.iconClass}`} />
      <div className="flex-1 min-w-0 space-y-2">
        <div>
          <p className={`text-sm font-medium ${styles.titleClass}`}>{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {(accion || atras || viewLink) && (
          <div className="flex flex-wrap items-center gap-2">
            {accion}
            {viewLink && (
              <Button size="sm" variant="outline" asChild>
                <a href={viewLink.href} target="_blank" rel="noreferrer">
                  {viewLink.label}
                </a>
              </Button>
            )}
            {atras}
          </div>
        )}
      </div>
    </div>
  )
}

const STATUS_STYLES: Record<ChipStatus, { Icon: typeof CheckCircle2; iconClass: string; titleClass: string }> = {
  OK: {
    Icon: CheckCircle2,
    iconClass: 'text-emerald-500',
    titleClass: 'text-emerald-400',
  },
  PENDING: {
    Icon: Clock,
    iconClass: 'text-amber-500',
    titleClass: 'text-amber-300',
  },
  PENDING_TRANSFER: {
    Icon: Clock,
    iconClass: 'text-amber-500',
    titleClass: 'text-amber-300',
  },
  LATER: {
    Icon: Circle,
    iconClass: 'text-muted-foreground/50',
    titleClass: 'text-muted-foreground',
  },
}

// ─── Subtítulos por chip ───────────────────────────────────────────────────

function chip1Subtitle(status: ChipStatus, contrato: ContratoExistente | null): string {
  if (status === 'OK') {
    return contrato
      ? `Folio ${contrato.numeroContrato} — firmado y subido`
      : 'Subido'
  }
  if (status === 'PENDING') {
    if (contrato) return 'Imprime el contrato, hazlo firmar y sube la versión firmada'
    return 'Genera el contrato, imprímelo, fírmalo con el cliente y súbelo'
  }
  return 'Primer paso del flujo de activación'
}

function chip2Subtitle(status: ChipStatus): string {
  if (status === 'OK') return 'Cobrado'
  if (status === 'PENDING_TRANSFER') {
    return 'Pago registrado vía transferencia. Pendiente de verificación por Gerente Zonal.'
  }
  if (status === 'PENDING') return 'Cobra al cliente la comisión / seguro de apertura'
  return 'Se procesa al activar (después del contrato firmado)'
}

function chip3Subtitle(status: ChipStatus): string {
  if (status === 'OK') return 'Capturada — préstamo activo'
  if (status === 'PENDING') return 'Toma la foto al entregar el dinero. Activa el préstamo y genera el calendario de pagos.'
  return 'Se captura al entregar el dinero (último paso del flujo)'
}
