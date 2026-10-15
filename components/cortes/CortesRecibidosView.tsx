'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, CheckCircle2, XCircle, Camera, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'

interface CorteDTO {
  id:                        string
  estado:                    'ABIERTO' | 'ENTREGADO' | 'ACEPTADO' | 'RECHAZADO'
  fecha:                     string
  user:                      { id: string; nombre: string; rol: string }
  branchNombre:              string
  totalEfectivoCobrado:      number
  totalTarjetaCobrado:       number
  totalTransferenciaCobrado: number
  totalRecibidoDeOtros:      number
  totalAEntregar:            number
  fotoTicketUrl:             string | null
  entregadoAt:               string | null
  aceptadoAt:                string | null
  montoAceptado:             number | null
  rechazadoAt:               string | null
  rechazoRazon:              string | null
}

interface Props {
  cortes: CorteDTO[]
}

const ROL_LABELS: Record<string, string> = {
  COORDINADOR:        'Coordinadora',
  COBRADOR:           'Cobrador',
  GERENTE:            'Gerente',
  GERENTE_ZONAL:      'Gerente Zonal',
  MESA_CONTROL:       'Mesa de Control',
  DIRECTOR_GENERAL:   'Director General',
  DIRECTOR_COMERCIAL: 'Director Comercial',
  SUPER_ADMIN:        'Super Admin',
}

export function CortesRecibidosView({ cortes }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [tab, setTab] = useState<'pendientes' | 'historial'>('pendientes')
  const [procesando, setProcesando] = useState<string | null>(null)
  const [verFoto, setVerFoto] = useState<string | null>(null)
  const [rechazarId, setRechazarId] = useState<string | null>(null)

  const pendientes = useMemo(() => cortes.filter((c) => c.estado === 'ENTREGADO'), [cortes])
  const historial  = useMemo(() => cortes.filter((c) => c.estado !== 'ENTREGADO'), [cortes])

  async function aceptar(c: CorteDTO) {
    const ok = confirm(`¿Confirmas que recibiste $${c.totalAEntregar.toFixed(2)} de ${c.user.nombre}?`)
    if (!ok) return
    setProcesando(c.id)
    try {
      const res = await fetch(`/api/cortes/${c.id}/aceptar`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ montoAceptado: c.totalAEntregar }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Error al aceptar')
      toast({ title: 'Corte aceptado' })
      router.refresh()
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Error',
        variant: 'destructive',
      })
    } finally {
      setProcesando(null)
    }
  }

  async function rechazar(c: CorteDTO, razon: string, montoReal?: number) {
    setProcesando(c.id)
    try {
      const res = await fetch(`/api/cortes/${c.id}/rechazar`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ razon, montoRealRecibido: montoReal }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Error al rechazar')
      toast({ title: 'Corte rechazado', description: 'Avisa a la coordinadora para que vuelva a entregar.' })
      setRechazarId(null)
      router.refresh()
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Error',
        variant: 'destructive',
      })
    } finally {
      setProcesando(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab('pendientes')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-colors ${
            tab === 'pendientes'
              ? 'bg-fuchsia-500/20 text-fuchsia-200 border border-fuchsia-500/40'
              : 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700'
          }`}
        >
          <Clock className="h-3.5 w-3.5" />
          Pendientes ({pendientes.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('historial')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-colors ${
            tab === 'historial'
              ? 'bg-fuchsia-500/20 text-fuchsia-200 border border-fuchsia-500/40'
              : 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700'
          }`}
        >
          Historial ({historial.length})
        </button>
      </div>

      {/* Lista */}
      <div className="space-y-3">
        {(tab === 'pendientes' ? pendientes : historial).length === 0 && (
          <p className="text-sm text-gray-500 italic">
            {tab === 'pendientes' ? 'Sin pendientes de aceptar.' : 'Sin histórico aún.'}
          </p>
        )}
        {(tab === 'pendientes' ? pendientes : historial).map((c) => (
          <div
            key={c.id}
            className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm space-y-3"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="font-semibold text-gray-900">{c.user.nombre}</p>
                <p className="text-xs text-gray-500">
                  {ROL_LABELS[c.user.rol] ?? c.user.rol} · {c.branchNombre}
                </p>
                <p className="text-xs text-gray-500">
                  {new Date(c.fecha).toLocaleDateString('es-MX', { dateStyle: 'medium' })}
                  {c.entregadoAt && <> · Entregado {new Date(c.entregadoAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</>}
                </p>
              </div>
              <EstadoBadge estado={c.estado} />
            </div>

            {/* Montos */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <MontoCell label="Efectivo cobrado"       value={c.totalEfectivoCobrado} />
              <MontoCell label="Tarjeta cobrado"        value={c.totalTarjetaCobrado} />
              <MontoCell label="Transferencia cobrado"  value={c.totalTransferenciaCobrado} />
              {c.totalRecibidoDeOtros > 0 && (
                <MontoCell label="Recibido de otros"    value={c.totalRecibidoDeOtros} />
              )}
            </div>
            <div className="flex items-center justify-between border-t border-gray-200 pt-2">
              <span className="text-sm font-semibold text-gray-700">A entregar en efectivo</span>
              <span className="text-lg font-bold font-mono text-fuchsia-600">
                ${c.totalAEntregar.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </span>
            </div>

            {/* Foto */}
            {c.fotoTicketUrl && (
              <button
                type="button"
                onClick={() => setVerFoto(c.fotoTicketUrl)}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                <Camera className="h-4 w-4" /> Ver foto del ticket firmado
              </button>
            )}

            {/* Acciones (solo pendientes) */}
            {c.estado === 'ENTREGADO' && (
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setRechazarId(c.id)}
                  disabled={procesando === c.id}
                >
                  <XCircle className="h-4 w-4" /> Rechazar
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => aceptar(c)}
                  disabled={procesando === c.id}
                >
                  {procesando === c.id
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Procesando...</>
                    : <><CheckCircle2 className="h-4 w-4" /> Aceptar ${c.totalAEntregar.toFixed(2)}</>
                  }
                </Button>
              </div>
            )}

            {/* Resumen de aceptación / rechazo (histórico) */}
            {c.estado === 'ACEPTADO' && c.aceptadoAt && (
              <p className="text-xs text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Aceptado por ${c.montoAceptado?.toFixed(2)} el {new Date(c.aceptadoAt).toLocaleString('es-MX')}
              </p>
            )}
            {c.estado === 'RECHAZADO' && c.rechazadoAt && (
              <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                <p className="font-semibold">Rechazado el {new Date(c.rechazadoAt).toLocaleString('es-MX')}</p>
                <p className="mt-0.5">{c.rechazoRazon}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Modal ver foto */}
      {verFoto && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setVerFoto(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={verFoto} alt="Ticket firmado" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}

      {/* Modal rechazar */}
      {rechazarId && (
        <RechazarDialog
          corte={cortes.find((c) => c.id === rechazarId)!}
          onClose={() => setRechazarId(null)}
          onRechazar={(razon, monto) => rechazar(cortes.find((c) => c.id === rechazarId)!, razon, monto)}
          procesando={procesando === rechazarId}
        />
      )}
    </div>
  )
}

function MontoCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between items-center rounded-md bg-gray-50 px-2 py-1">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="font-mono text-gray-800">
        ${value.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
      </span>
    </div>
  )
}

function EstadoBadge({ estado }: { estado: string }) {
  const cfg: Record<string, { label: string; className: string }> = {
    ABIERTO:   { label: 'Abierto',    className: 'bg-gray-100 text-gray-700 border-gray-300' },
    ENTREGADO: { label: 'Pendiente',  className: 'bg-amber-50 text-amber-700 border-amber-300' },
    ACEPTADO:  { label: 'Aceptado',   className: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
    RECHAZADO: { label: 'Rechazado',  className: 'bg-red-50 text-red-700 border-red-300' },
  }
  const c = cfg[estado] ?? cfg.ABIERTO
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${c.className}`}>
      {c.label}
    </span>
  )
}

function RechazarDialog({
  corte,
  onClose,
  onRechazar,
  procesando,
}: {
  corte:      CorteDTO
  onClose:    () => void
  onRechazar: (razon: string, montoReal?: number) => void
  procesando: boolean
}) {
  const [razon, setRazon] = useState('')
  const [montoTxt, setMontoTxt] = useState('')

  const monto = Number(montoTxt.replace(/[^0-9.]/g, ''))

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Rechazar corte</h2>
          <p className="text-xs text-gray-500">de {corte.user.nombre} — $${corte.totalAEntregar.toFixed(2)}</p>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Razón del rechazo *</label>
            <textarea
              value={razon}
              onChange={(e) => setRazon(e.target.value)}
              rows={3}
              placeholder="Ej. Faltante de $200, ticket sin firma, foto borrosa..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-fuchsia-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Monto real recibido (opcional)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={montoTxt}
              onChange={(e) => setMontoTxt(e.target.value)}
              placeholder="$0.00"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-fuchsia-500"
            />
            <p className="text-[11px] text-gray-500 mt-1">Si contaste algo distinto, captúralo aquí (solo informativo).</p>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={procesando}>Cancelar</Button>
            <Button
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              onClick={() => onRechazar(razon.trim(), monto > 0 ? monto : undefined)}
              disabled={razon.trim().length < 3 || procesando}
            >
              {procesando ? <><Loader2 className="h-4 w-4 animate-spin" /> Rechazando...</> : 'Rechazar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
