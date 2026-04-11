'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Badge } from '@/components/ui/badge'
import { Loader2, Pencil, Check, X, AlertCircle, Undo2 } from 'lucide-react'
import { formatMoney } from '@/lib/utils'
import { formatDate } from '@/lib/utils'
import type { ScheduleStatus } from '@prisma/client'

const STATUS_VARIANT: Record<ScheduleStatus, 'success' | 'warning' | 'error' | 'info' | 'outline'> = {
  PAID: 'success',
  PENDING: 'warning',
  OVERDUE: 'error',
  PARTIAL: 'info',
  ADVANCE: 'success',
}
const STATUS_LABEL: Record<ScheduleStatus, string> = {
  PAID: 'Pagado',
  PENDING: 'Pendiente',
  OVERDUE: 'Vencido',
  PARTIAL: 'Parcial',
  ADVANCE: 'Adelantado',
}

function toInputValue(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface ScheduleItem {
  id: string
  numeroPago: number
  fechaVencimiento: Date | string
  montoEsperado: number
  estado: ScheduleStatus
}

interface Props {
  loanId: string
  schedule: ScheduleItem[]
  canCapture: boolean
  canEditDates: boolean
  canUndo: boolean
}

export function ScheduleDateEditor({ loanId, schedule, canCapture, canEditDates, canUndo }: Props) {
  const router   = useRouter()
  const { toast } = useToast()
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [dateValue, setDateValue]   = useState('')
  const [saving, setSaving]         = useState(false)
  const [confirmUndoId, setConfirmUndoId] = useState<string | null>(null)
  const [undoing, setUndoing]             = useState(false)

  function startEdit(s: ScheduleItem) {
    setEditingId(s.id)
    setDateValue(toInputValue(s.fechaVencimiento))
  }

  async function saveDate(s: ScheduleItem) {
    if (!dateValue) return
    setSaving(true)
    try {
      const res = await fetch(`/api/loans/${loanId}/schedule/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fechaVencimiento: dateValue }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Error')
      toast({ title: `Pago ${s.numeroPago} — fecha actualizada` })
      setEditingId(null)
      router.refresh()
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  async function undoPayment(s: ScheduleItem) {
    setUndoing(true)
    try {
      const res = await fetch(`/api/loans/${loanId}/schedule/${s.id}/undo`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Error')
      toast({ title: `Pago ${s.numeroPago} revertido a Pendiente` })
      setConfirmUndoId(null)
      router.refresh()
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
    } finally {
      setUndoing(false)
    }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return (
    <div className="divide-y">
      {schedule.map((s) => {
        const isEditing = editingId === s.id
        // SUPER_ADMIN (canUndo=true) puede editar cualquier fila.
        // Otros roles solo pueden editar las que no están PAID ni ADVANCE.
        const editable  = canUndo
          ? canEditDates
          : canEditDates && s.estado !== 'PAID' && s.estado !== 'ADVANCE'

        // Visually overdue: date has passed but still stored as PENDING/PARTIAL
        // Use UTC date components to avoid timezone shift
        const _d = typeof s.fechaVencimiento === 'string' ? new Date(s.fechaVencimiento) : s.fechaVencimiento
        const dueDate = new Date(_d.getUTCFullYear(), _d.getUTCMonth(), _d.getUTCDate())
        const isVisuallyOverdue =
          (s.estado === 'PENDING' || s.estado === 'PARTIAL') && dueDate < today

        return (
          <div
            key={s.id}
            className={`flex items-center gap-2 py-2 text-sm ${isVisuallyOverdue ? 'bg-red-500/5' : ''}`}
          >
            <span className={`w-7 shrink-0 ${isVisuallyOverdue ? 'text-red-400 font-semibold' : 'text-muted-foreground'}`}>
              {s.numeroPago}.
            </span>

            {/* Date cell */}
            {isEditing ? (
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  value={dateValue}
                  onChange={(e) => setDateValue(e.target.value)}
                  className="border rounded px-2 py-0.5 text-xs"
                  autoFocus
                />
                <Button
                  size="sm"
                  className="h-6 w-6 p-0"
                  variant="success"
                  disabled={saving}
                  onClick={() => saveDate(s)}
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                </Button>
                <Button
                  size="sm"
                  className="h-6 w-6 p-0"
                  variant="outline"
                  disabled={saving}
                  onClick={() => setEditingId(null)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <span className="w-24 shrink-0 flex items-center gap-1">
                <span className={isVisuallyOverdue ? 'text-red-400 font-medium' : ''}>
                  {formatDate(s.fechaVencimiento)}
                </span>
                {isVisuallyOverdue && (
                  <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                )}
                {editable && (
                  <button
                    onClick={() => startEdit(s)}
                    className="text-muted-foreground hover:text-primary-600 transition-colors"
                    title="Editar fecha"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </span>
            )}

            <span className="font-medium w-20 shrink-0">{formatMoney(s.montoEsperado)}</span>
            <Badge
              variant={isVisuallyOverdue ? 'error' : STATUS_VARIANT[s.estado]}
              className="text-xs"
            >
              {isVisuallyOverdue ? 'Vencido' : STATUS_LABEL[s.estado]}
            </Badge>

            {canCapture && (s.estado === 'PENDING' || s.estado === 'OVERDUE' || s.estado === 'PARTIAL') && (
              <a
                href={`/cobros/capturar/${s.id}`}
                className="ml-auto flex items-center gap-1 text-xs border rounded px-2 py-1 hover:bg-gray-50 transition-colors shrink-0"
              >
                Capturar
              </a>
            )}

            {/* Undo — solo SUPER_ADMIN, solo pagos marcados como PAID */}
            {canUndo && s.estado === 'PAID' && (
              <div className="ml-auto shrink-0">
                {confirmUndoId === s.id ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-amber-400">¿Revertir?</span>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-6 px-2 text-xs"
                      disabled={undoing}
                      onClick={() => undoPayment(s)}
                    >
                      {undoing ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Sí'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-xs"
                      disabled={undoing}
                      onClick={() => setConfirmUndoId(null)}
                    >
                      No
                    </Button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmUndoId(s.id)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-amber-400 transition-colors border border-dashed border-border/50 rounded px-2 py-1 hover:border-amber-400/50"
                    title="Deshacer pago (SUPER_ADMIN)"
                  >
                    <Undo2 className="h-3 w-3" />
                    Deshacer
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
