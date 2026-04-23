'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FileText, CheckCircle2, Check } from 'lucide-react'

interface ChecklistItem {
  id: string
  label: string
  checked: boolean
}

type LoanTipo = 'SOLIDARIO' | 'INDIVIDUAL' | 'AGIL' | 'FIDUCIARIO'

const DEFAULT_CHECKLISTS: Record<LoanTipo, Omit<ChecklistItem, 'checked'>[]> = {
  SOLIDARIO: [
    { id: 'ine_todos', label: 'INE/IFE de todos los integrantes' },
    { id: 'curp_todos', label: 'CURP de todos los integrantes' },
    { id: 'domicilio_todos', label: 'Comprobante de domicilio (máx. 3 meses) de todos los integrantes' },
    { id: 'solicitud_grupal', label: 'Solicitud de crédito grupal firmada' },
    { id: 'fotos_negocio', label: 'Fotografías del negocio de cada integrante' },
    { id: 'acta_grupo', label: 'Acta de integración del grupo solidario' },
  ],
  INDIVIDUAL: [
    { id: 'ine', label: 'INE/IFE vigente' },
    { id: 'curp', label: 'CURP' },
    { id: 'domicilio', label: 'Comprobante de domicilio (máx. 3 meses)' },
    { id: 'solicitud', label: 'Solicitud de crédito individual firmada' },
    { id: 'fotos_negocio', label: 'Fotografías del negocio' },
    { id: 'ingresos', label: 'Comprobante de ingresos (últimos 3 meses)' },
  ],
  AGIL: [
    { id: 'ine', label: 'INE/IFE vigente' },
    { id: 'curp', label: 'CURP' },
    { id: 'domicilio', label: 'Comprobante de domicilio (máx. 3 meses)' },
    { id: 'solicitud', label: 'Solicitud de crédito ágil firmada' },
  ],
  FIDUCIARIO: [
    { id: 'ine', label: 'INE/IFE vigente' },
    { id: 'curp', label: 'CURP' },
    { id: 'domicilio', label: 'Comprobante de domicilio (máx. 3 meses)' },
    { id: 'ingresos', label: 'Comprobante de ingresos (últimos 3 meses)' },
    { id: 'solicitud', label: 'Solicitud de crédito fiduciario firmada' },
    { id: 'contrato', label: 'Contrato de crédito fiduciario firmado' },
    { id: 'pagare', label: 'Pagaré firmado' },
    { id: 'garantia_doc', label: 'Documento de garantía (escritura / factura / título)' },
    { id: 'avaluo', label: 'Avalúo del bien en garantía' },
    { id: 'seguro', label: 'Póliza de seguro del bien (si aplica)' },
  ],
}

function buildInitialChecklist(tipo: LoanTipo, saved: ChecklistItem[] | null): ChecklistItem[] {
  const defaults = DEFAULT_CHECKLISTS[tipo] ?? []
  if (!saved || saved.length === 0) {
    return defaults.map((d) => ({ ...d, checked: false }))
  }
  // Merge: preserve checked state, add any new items not yet in saved
  const savedMap = new Map(saved.map((s) => [s.id, s.checked]))
  return defaults.map((d) => ({ ...d, checked: savedMap.get(d.id) ?? false }))
}

interface Props {
  loanId: string
  tipo: LoanTipo
  savedChecklist?: ChecklistItem[] | null
  readOnly?: boolean
}

export function DocumentChecklist({ loanId, tipo, savedChecklist, readOnly = false }: Props) {
  const [items, setItems] = useState<ChecklistItem[]>(() =>
    buildInitialChecklist(tipo, savedChecklist ?? null)
  )
  const [isPending, startTransition] = useTransition()
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  const checkedCount = items.filter((i) => i.checked).length
  const total = items.length
  const allDone = checkedCount === total

  function toggle(id: string) {
    if (readOnly) return
    const updated = items.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i))
    setItems(updated)
    startTransition(async () => {
      try {
        await fetch(`/api/loans/${loanId}/checklist`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checklist: updated }),
        })
        setLastSaved(new Date())
      } catch {
        // silently fail — user sees no feedback on error but state is consistent locally
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Documentación requerida
          </span>
          <span className="flex items-center gap-2">
            {allDone ? (
              <Badge variant="success" className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Completo
              </Badge>
            ) : (
              <Badge variant="warning">
                {checkedCount}/{total}
              </Badge>
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              role={!readOnly ? 'button' : undefined}
              tabIndex={!readOnly ? 0 : undefined}
              onKeyDown={(e) => { if (!readOnly && (e.key === ' ' || e.key === 'Enter')) toggle(item.id) }}
              className={`flex items-start gap-3 rounded-lg p-2 transition-colors ${
                !readOnly ? 'cursor-pointer hover:bg-muted/50' : ''
              }`}
              onClick={() => toggle(item.id)}
            >
              {/* Custom checkbox */}
              <div
                className={`mt-0.5 h-4 w-4 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
                  item.checked
                    ? 'bg-primary border-primary'
                    : 'border-muted-foreground/40 bg-white'
                }`}
              >
                {item.checked && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
              </div>
              <span
                className={`text-sm leading-snug ${
                  item.checked ? 'line-through text-muted-foreground' : ''
                }`}
              >
                {item.label}
              </span>
            </div>
          ))}
        </div>
        {lastSaved && !readOnly && (
          <p className="text-xs text-muted-foreground mt-3">
            Guardado {lastSaved.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
