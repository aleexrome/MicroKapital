import { Badge } from '@/components/ui/badge'
import type { LoanStatus } from '@prisma/client'

const STATUS_MAP: Record<LoanStatus, { label: string; variant: 'success' | 'warning' | 'error' | 'info' | 'outline' | 'secondary' }> = {
  PENDING_APPROVAL: { label: 'Pendiente aprobación', variant: 'warning' },
  APPROVED:         { label: 'Aprobado — pendiente activar', variant: 'info' },
  IN_ACTIVATION:    { label: 'Activación en curso', variant: 'warning' },
  ACTIVE:           { label: 'Activo', variant: 'success' },
  LIQUIDATED:       { label: 'Liquidado', variant: 'secondary' },
  REJECTED:         { label: 'Rechazado', variant: 'error' },
  RESTRUCTURED:     { label: 'Reestructurado', variant: 'secondary' },
  DEFAULTED:        { label: 'Incumplido', variant: 'error' },
  DECLINED:         { label: 'Cancelado en activación', variant: 'error' },
}

export function ApprovalBadge({ status }: { status: LoanStatus }) {
  const { label, variant } = STATUS_MAP[status] ?? { label: status, variant: 'outline' as const }
  return <Badge variant={variant}>{label}</Badge>
}
