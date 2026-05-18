'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { CheckCircle, XCircle, Loader2, Edit2, ChevronDown, ChevronUp } from 'lucide-react'

interface GrupoMiembro {
  loanId: string
  clientNombre: string
  capital: number
  esCoordinadora?: boolean
}

interface LoanApprovalActionsProps {
  loanId: string
  tipo: string
  capital: number
  tasaInteres?: number
  grupoMiembros?: GrupoMiembro[]
  // Día (LUNES..DOMINGO) y hora límite (HH:MM 24h) que DG plasma en el
  // contrato. Default = lo que tenga el préstamo o, si no, la sucursal.
  defaultDiaCobro?: string
  defaultHoraLimite?: string
}

const DIAS_COBRO: { value: string; label: string }[] = [
  { value: 'LUNES',     label: 'Lunes' },
  { value: 'MARTES',    label: 'Martes' },
  { value: 'MIERCOLES', label: 'Miércoles' },
  { value: 'JUEVES',    label: 'Jueves' },
  { value: 'VIERNES',   label: 'Viernes' },
  { value: 'SABADO',    label: 'Sábado' },
  { value: 'DOMINGO',   label: 'Domingo' },
]

export function LoanApprovalActions({ loanId, tipo, capital, tasaInteres, grupoMiembros, defaultDiaCobro, defaultHoraLimite }: LoanApprovalActionsProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [processing, setProcessing] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [showContrapropuesta, setShowContrapropuesta] = useState(false)
  const [razonRechazo, setRazonRechazo] = useState('')
  const [nuevoCapital, setNuevoCapital] = useState(capital.toString())
  const [nuevaTasa, setNuevaTasa] = useState(tasaInteres?.toString() ?? '')
  const [notasDG, setNotasDG] = useState('')
  const [requiereDocumentos, setRequiereDocumentos] = useState(false)
  const [capitalesMiembros, setCapitalesMiembros] = useState<Record<string, string>>(
    () => grupoMiembros
      ? Object.fromEntries(grupoMiembros.map((m) => [m.loanId, m.capital.toString()]))
      : {}
  )
  // Coordinadora del grupo (SOLIDARIO). Default: el integrante que ya está
  // marcado como coordinadora si existe (continuar selección previa), o el
  // primero de la lista (mismo criterio que se usaba implícitamente antes).
  const [coordinadoraLoanId, setCoordinadoraLoanId] = useState<string>(() => {
    if (!grupoMiembros || grupoMiembros.length === 0) return ''
    const yaCoord = grupoMiembros.find((m) => m.esCoordinadora)
    return yaCoord?.loanId ?? grupoMiembros[0]!.loanId
  })
  const [fechaDesembolsoCP, setFechaDesembolsoCP] = useState('')
  const [fechaPrimerPagoCP, setFechaPrimerPagoCP] = useState('')
  // Día y hora límite de cobro que se plasman en el contrato. DG puede
  // ajustarlos en el modal de aprobación; defaults vienen del préstamo o
  // la sucursal (pasados como props).
  const [diaCobro, setDiaCobro] = useState<string>(defaultDiaCobro ?? '')
  const [horaLimite, setHoraLimite] = useState<string>(defaultHoraLimite ?? '')

  async function handleApprove(conContrapropuesta = false) {
    setProcessing(true)
    try {
      const esGrupo = tipo === 'SOLIDARIO' && grupoMiembros && grupoMiembros.length > 0

      if (esGrupo) {
        // Validar capitales por miembro antes de enviar
        if (conContrapropuesta) {
          for (const m of grupoMiembros!) {
            const cap = parseFloat(capitalesMiembros[m.loanId] ?? '')
            if (!cap || cap <= 0) {
              toast({ title: 'Error', description: `Capital inválido para ${m.clientNombre}`, variant: 'destructive' })
              setProcessing(false)
              return
            }
          }
        }

        await Promise.all(
          grupoMiembros!.map(async (m) => {
            const body: Record<string, unknown> = {
              // Marca a este integrante como coordinadora si fue el elegido en
              // el dropdown. El backend pone false en los demás del grupo.
              esCoordinadora: m.loanId === coordinadoraLoanId,
              // Día y hora aplican a todos los integrantes del grupo por igual.
              ...(diaCobro ? { diaCobro } : {}),
              ...(horaLimite ? { horaLimiteCobro: horaLimite } : {}),
            }
            if (conContrapropuesta) {
              body.contrapropuesta = {
                capital: parseFloat(capitalesMiembros[m.loanId] ?? '0'),
                ...(fechaDesembolsoCP ? { fechaDesembolso: fechaDesembolsoCP } : {}),
                ...(fechaPrimerPagoCP ? { fechaPrimerPago: fechaPrimerPagoCP } : {}),
              }
            }
            if (notasDG) body.notas = notasDG
            if (requiereDocumentos) body.requiereDocumentos = true

            const res = await fetch(`/api/loans/${m.loanId}/approve`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
            if (!res.ok) {
              const err = await res.json().catch(() => ({}))
              throw new Error(`${m.clientNombre}: ${err.error ?? 'Error al aprobar'}`)
            }
          })
        )

        toast({
          title: conContrapropuesta ? '✅ Contrapropuesta enviada' : '✅ Grupo aprobado',
          description: conContrapropuesta
            ? 'El coordinador presentará las nuevas condiciones a cada integrante'
            : `${grupoMiembros!.length} integrantes aprobados · Pendiente de activación`,
        })
      } else {
        const body: Record<string, unknown> = {
          ...(diaCobro ? { diaCobro } : {}),
          ...(horaLimite ? { horaLimiteCobro: horaLimite } : {}),
        }
        if (conContrapropuesta) {
          const cap = parseFloat(nuevoCapital)
          if (!cap || cap <= 0) {
            toast({ title: 'Error', description: 'Ingresa un capital válido', variant: 'destructive' })
            setProcessing(false)
            return
          }
          body.contrapropuesta = {
            capital: cap,
            ...(nuevaTasa ? { tasaInteres: parseFloat(nuevaTasa) } : {}),
            ...(fechaDesembolsoCP ? { fechaDesembolso: fechaDesembolsoCP } : {}),
            ...(fechaPrimerPagoCP ? { fechaPrimerPago: fechaPrimerPagoCP } : {}),
          }
        }
        if (notasDG) body.notas = notasDG
        if (requiereDocumentos) body.requiereDocumentos = true

        const res = await fetch(`/api/loans/${loanId}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error ?? 'Error al aprobar')
        }
        const data = await res.json()
        toast({
          title: conContrapropuesta ? '✅ Contrapropuesta enviada' : '✅ Préstamo aprobado',
          description: data.message,
        })
      }

      router.refresh()
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' })
    } finally {
      setProcessing(false)
    }
  }

  async function handleReject() {
    if (!razonRechazo.trim()) return
    setProcessing(true)
    try {
      const res = await fetch(`/api/loans/${loanId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ razonRechazo }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Error al rechazar')
      }
      toast({ title: 'Préstamo rechazado' })
      setShowReject(false)
      setRazonRechazo('')
      router.refresh()
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' })
    } finally {
      setProcessing(false)
    }
  }

  if (showReject) {
    return (
      <div className="flex flex-col gap-2 w-full sm:max-w-sm pt-2">
        <input
          className="border rounded px-3 py-2 text-sm w-full"
          placeholder="Razón del rechazo..."
          value={razonRechazo}
          onChange={(e) => setRazonRechazo(e.target.value)}
          autoFocus
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="destructive"
            disabled={!razonRechazo.trim() || processing}
            onClick={handleReject}
          >
            {processing ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirmar rechazo'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowReject(false)}>Cancelar</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 pt-2">
      {/* Selector de coordinadora del grupo — sólo SOLIDARIO grupal.
          Aplica tanto al aprobado simple como a la contrapropuesta. */}
      {tipo === 'SOLIDARIO' && grupoMiembros && grupoMiembros.length > 1 && (
        <div className="rounded-lg border border-primary-200 bg-primary-50 p-2.5 text-sm">
          <label className="block text-xs font-semibold text-primary-800 mb-1.5">
            Coordinadora del grupo
          </label>
          <select
            value={coordinadoraLoanId}
            onChange={(e) => setCoordinadoraLoanId(e.target.value)}
            className="w-full border border-primary-300 rounded px-2 py-1.5 text-sm bg-white"
            disabled={processing}
          >
            {grupoMiembros.map((m) => (
              <option key={m.loanId} value={m.loanId}>
                {m.clientNombre}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-primary-700 mt-1.5 leading-snug">
            Será el ancla del contrato y desde su perfil se dispara la activación
            grupal (foto y comisiones se aplican a todo el grupo).
          </p>
        </div>
      )}

      {/* Día y hora límite de cobro — siempre visibles para que DG los
          confirme/ajuste antes de aprobar. Se plasman en el contrato. */}
      <div className="rounded-lg border border-primary-200 bg-primary-50 p-2.5 text-sm">
        <p className="text-xs font-semibold text-primary-800 mb-1.5">
          Día y hora de cobro {grupoMiembros && grupoMiembros.length > 1 ? '(aplica a todo el grupo)' : ''}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={diaCobro}
            onChange={(e) => setDiaCobro(e.target.value)}
            disabled={processing}
            className="border border-primary-300 rounded px-2 py-1.5 text-sm bg-white"
          >
            <option value="">— Día —</option>
            {DIAS_COBRO.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
          <input
            type="time"
            value={horaLimite}
            onChange={(e) => setHoraLimite(e.target.value)}
            disabled={processing}
            className="border border-primary-300 rounded px-2 py-1.5 text-sm bg-white"
          />
        </div>
        <p className="text-[11px] text-primary-700 mt-1.5 leading-snug">
          Se imprime en el contrato. Si lo dejas vacío, se conserva el valor actual del préstamo.
        </p>
      </div>

      {/* Botones principales */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="success" disabled={processing} onClick={() => handleApprove(false)}>
          {processing
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <><CheckCircle className="h-4 w-4 mr-1" />{grupoMiembros ? `Aprobar grupo (${grupoMiembros.length})` : 'Aprobar'}</>
          }
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-amber-400 text-amber-700 hover:bg-amber-50"
          onClick={() => setShowContrapropuesta((v) => !v)}
        >
          <Edit2 className="h-4 w-4 mr-1" />
          Contrapropuesta
          {showContrapropuesta ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-red-300 text-red-600 hover:bg-red-50"
          onClick={() => setShowReject(true)}
        >
          <XCircle className="h-4 w-4 mr-1" />Rechazar
        </Button>
      </div>

      {/* Formulario de contrapropuesta */}
      {showContrapropuesta && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm space-y-2">
          <p className="font-semibold text-amber-800">Contrapropuesta del Director General</p>
          <p className="text-xs text-amber-700">
            Ajusta las condiciones. El crédito se aprobará con los nuevos valores y el coordinador
            visitará al cliente para presentarle la contrapropuesta.
          </p>
          {tipo === 'SOLIDARIO' && grupoMiembros ? (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-amber-800">Capital por integrante</p>
              {grupoMiembros.map((m) => (
                <div key={m.loanId} className="flex items-center gap-2">
                  <span className="flex-1 text-xs text-amber-700 truncate">{m.clientNombre}</span>
                  <div className="relative w-32 shrink-0">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-amber-600 text-xs">$</span>
                    <input
                      type="number"
                      min={100}
                      step={100}
                      className="border border-amber-300 rounded pl-5 pr-2 py-1.5 text-sm w-full bg-white"
                      value={capitalesMiembros[m.loanId] ?? ''}
                      onChange={(e) => setCapitalesMiembros((prev) => ({ ...prev, [m.loanId]: e.target.value }))}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-amber-700 mb-1">Nuevo capital ($)</label>
                <input
                  type="number"
                  min={1}
                  step={500}
                  className="border border-amber-300 rounded px-2 py-1.5 text-sm w-full bg-white"
                  value={nuevoCapital}
                  onChange={(e) => setNuevoCapital(e.target.value)}
                />
              </div>
              {tipo === 'FIDUCIARIO' && (
                <div>
                  <label className="block text-xs text-amber-700 mb-1">Tasa de interés (ej. 0.30)</label>
                  <input
                    type="number"
                    min={0.01}
                    max={1}
                    step={0.01}
                    className="border border-amber-300 rounded px-2 py-1.5 text-sm w-full bg-white"
                    value={nuevaTasa}
                    onChange={(e) => setNuevaTasa(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}
          {/* Fechas definidas por el DG — anclan el calendario al activar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-amber-700 mb-1">Fecha de desembolso</label>
              <input
                type="date"
                className="border border-amber-300 rounded px-2 py-1.5 text-sm w-full bg-white"
                value={fechaDesembolsoCP}
                onChange={(e) => setFechaDesembolsoCP(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-amber-700 mb-1">Fecha del primer pago</label>
              <input
                type="date"
                className="border border-amber-300 rounded px-2 py-1.5 text-sm w-full bg-white"
                value={fechaPrimerPagoCP}
                onChange={(e) => setFechaPrimerPagoCP(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-amber-700 mb-1">Notas para el coordinador (opcional)</label>
              <textarea
                rows={2}
                className="border border-amber-300 rounded px-2 py-1.5 text-sm w-full bg-white resize-none"
                placeholder="Indicaciones, condiciones especiales..."
                value={notasDG}
                onChange={(e) => setNotasDG(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={requiereDocumentos}
                onChange={(e) => setRequiereDocumentos(e.target.checked)}
                className="rounded"
              />
              <span className="text-xs font-semibold text-amber-800">
                Requiere documentación antes de activar
                <span className="font-normal text-amber-700 ml-1">(bloquea activación hasta subir los archivos)</span>
              </span>
            </label>
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={processing}
              onClick={() => handleApprove(true)}
            >
              {processing ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Enviar contrapropuesta'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowContrapropuesta(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
