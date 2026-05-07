import { CheckCircle2, Clock, Circle } from 'lucide-react'

interface EstadoFlujoActivacionProps {
  loanEstado: string                  // 'APPROVED' | 'ACTIVE' (otros estados también aceptados)
  contratoFirmadoSubido: boolean
  seguroPagado: boolean               // ya hay un Payment de apertura cobrado y no pendiente
  fotoDesembolsoSubida: boolean       // loan.desembolsoFotoUrl no null
  contractsRequired: boolean          // valor de la env var CONTRACTS_REQUIRED
}

type ChipStatus = 'OK' | 'PENDING' | 'LATER'

interface ChipDef {
  status: ChipStatus
  title: string
  subtitle: string
}

/**
 * Sección "Estado del flujo" — 3 chips informativos del avance del préstamo.
 *
 * Cada chip tiene 3 estados posibles:
 *   - OK      (verde, ✓)   — paso cumplido
 *   - PENDING (amarillo,⏳) — pendiente, se cumple en el paso actual
 *   - LATER   (gris, —)    — pendiente, paso posterior (informativo, no bloquea)
 *
 * Solo el primer chip ("Contrato firmado") es prerequisito real para activar
 * cuando CONTRACTS_REQUIRED=true. Los otros dos son visibilidad operativa
 * del avance — el seguro se cobra DURANTE activate, la foto se sube DESPUÉS.
 */
export function EstadoFlujoActivacion({
  loanEstado,
  contratoFirmadoSubido,
  seguroPagado,
  fotoDesembolsoSubida,
  contractsRequired,
}: EstadoFlujoActivacionProps) {
  const isApproved = loanEstado === 'APPROVED'
  const isActive   = loanEstado === 'ACTIVE'

  // ── Chip 1 — Contrato firmado por el cliente ─────────────────────────────
  const chip1: ChipDef = (() => {
    if (contratoFirmadoSubido) {
      return {
        status: 'OK',
        title: 'Contrato firmado por el cliente',
        subtitle: contractsRequired ? 'Requisito cumplido' : 'Subido',
      }
    }
    if (contractsRequired && isApproved) {
      return {
        status: 'PENDING',
        title: 'Contrato firmado por el cliente',
        subtitle: 'Requisito para activar',
      }
    }
    return {
      status: 'LATER',
      title: 'Contrato firmado por el cliente',
      subtitle: contractsRequired ? 'Requisito para activar' : 'Recomendado',
    }
  })()

  // ── Chip 2 — Pago de comisión / seguro ───────────────────────────────────
  const chip2: ChipDef = (() => {
    if (seguroPagado) {
      return {
        status: 'OK',
        title: 'Pago de comisión / seguro',
        subtitle: 'Cobrado',
      }
    }
    if (isApproved) {
      return {
        status: 'PENDING',
        title: 'Pago de comisión / seguro',
        subtitle: 'Se procesa al activar',
      }
    }
    return {
      status: 'LATER',
      title: 'Pago de comisión / seguro',
      subtitle: 'Se procesa al activar',
    }
  })()

  // ── Chip 3 — Foto del desembolso con GPS ─────────────────────────────────
  const chip3: ChipDef = (() => {
    if (fotoDesembolsoSubida) {
      return {
        status: 'OK',
        title: 'Foto del desembolso con GPS',
        subtitle: 'Capturada',
      }
    }
    if (isActive) {
      return {
        status: 'PENDING',
        title: 'Foto del desembolso con GPS',
        subtitle: 'Falta capturar — se sube al entregar el dinero',
      }
    }
    return {
      status: 'LATER',
      title: 'Foto del desembolso con GPS',
      subtitle: 'Se captura al entregar el dinero',
    }
  })()

  const chips = [chip1, chip2, chip3]

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Estado del flujo</h3>
        <p className="text-xs text-muted-foreground">
          Avance del proceso de activación
        </p>
      </div>

      <ul className="space-y-2">
        {chips.map((c, idx) => (
          <Chip key={idx} {...c} />
        ))}
      </ul>
    </div>
  )
}

function Chip({ status, title, subtitle }: ChipDef) {
  const styles = STATUS_STYLES[status]
  const Icon = styles.Icon

  return (
    <li className="flex items-start gap-3">
      <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${styles.iconClass}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${styles.titleClass}`}>{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </li>
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
  LATER: {
    Icon: Circle,
    iconClass: 'text-muted-foreground/50',
    titleClass: 'text-muted-foreground',
  },
}
