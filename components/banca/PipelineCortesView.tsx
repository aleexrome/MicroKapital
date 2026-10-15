'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, CheckCircle2, AlertCircle, XCircle, Users, ArrowRight, Calendar } from 'lucide-react'

interface CorteDTO {
  id:                        string
  estado:                    'ABIERTO' | 'ENTREGADO' | 'ACEPTADO' | 'RECHAZADO'
  user:                      { id: string; nombre: string; rol: string }
  branchId:                  string
  branchNombre:              string
  receptor:                  { id: string; nombre: string; rol: string } | null
  totalEfectivoCobrado:      number
  totalTarjetaCobrado:       number
  totalTransferenciaCobrado: number
  totalRecibidoDeOtros:      number
  totalAEntregar:            number
  montoAceptado:             number | null
  entregadoAt:               string | null
  aceptadoAt:                string | null
  rechazadoAt:               string | null
  rechazoRazon:              string | null
  fotoTicketUrl:             string | null
}

interface BranchDTO {
  id:           string
  nombre:       string
  concentrador: { id: string; nombre: string } | null
}

interface Props {
  cortes:       CorteDTO[]
  branches:     BranchDTO[]
  fechaInicial: string
}

const ROLES_FINALES = ['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'SUPER_ADMIN'] as const

export function PipelineCortesView({ cortes, branches, fechaInicial }: Props) {
  const router = useRouter()
  const [fecha, setFecha] = useState(fechaInicial)
  const [branchFilter, setBranchFilter] = useState<string>('')

  const cortesFiltrados = useMemo(() => {
    return branchFilter ? cortes.filter((c) => c.branchId === branchFilter) : cortes
  }, [cortes, branchFilter])

  // Clasificar cada corte en el eslabón que ocupa en el pipeline.
  //   enCampo               → ABIERTO (coord aún no entregó)
  //   esperandoConcentrador → ENTREGADO dirigido a concentrador local
  //   enConcentrador        → ACEPTADO cuyo dueño ES un concentrador
  //                           local (dinero en manos de él, aún no sube)
  //                           — identificado por `dueño es concentrador
  //                           de alguna sucursal`.
  //   enConcentradorRecibido → ACEPTADO cuyo RECEPTOR es concentrador
  //                            (consolidado en manos del concentrador,
  //                            aún no entregado a DG/DC).
  //   esperandoFinal        → ENTREGADO dirigido a DG/DC/SA
  //   cerrado               → ACEPTADO dirigido a DG/DC/SA
  //   rechazado             → RECHAZADO (anomalía visible)
  const concentradorIds = useMemo(
    () => new Set(branches.map((b) => b.concentrador?.id).filter(Boolean) as string[]),
    [branches],
  )

  const buckets = useMemo(() => {
    const r = {
      enCampo:                [] as CorteDTO[],
      esperandoConcentrador:  [] as CorteDTO[],
      enConcentradorRecibido: [] as CorteDTO[],
      esperandoFinal:         [] as CorteDTO[],
      cerrado:                [] as CorteDTO[],
      rechazado:              [] as CorteDTO[],
    }
    for (const c of cortesFiltrados) {
      const receptorEsFinal = c.receptor ? (ROLES_FINALES as readonly string[]).includes(c.receptor.rol) : false
      if (c.estado === 'ABIERTO') {
        r.enCampo.push(c)
      } else if (c.estado === 'RECHAZADO') {
        r.rechazado.push(c)
      } else if (c.estado === 'ENTREGADO') {
        if (receptorEsFinal) r.esperandoFinal.push(c)
        else                 r.esperandoConcentrador.push(c)
      } else if (c.estado === 'ACEPTADO') {
        if (receptorEsFinal) r.cerrado.push(c)
        else                 r.enConcentradorRecibido.push(c)
      }
    }
    return r
  }, [cortesFiltrados])

  const sum = (arr: CorteDTO[]) => arr.reduce((s, c) => s + c.totalAEntregar, 0)

  function changeFecha(d: string) {
    setFecha(d)
    const u = new URL(window.location.href)
    u.searchParams.set('fecha', d)
    router.push(u.pathname + u.search)
  }

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <input
            type="date"
            value={fecha}
            onChange={(e) => changeFecha(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>
        <select
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="">Todas las sucursales</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
        </select>
      </div>

      {/* KPIs del pipeline */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <PipelineKpi
          icon={<Users className="h-4 w-4 text-gray-500" />}
          label="En campo"
          count={buckets.enCampo.length}
          monto={sum(buckets.enCampo)}
          tone="gray"
        />
        <PipelineKpi
          icon={<Clock className="h-4 w-4 text-amber-500" />}
          label="Esperando concentrador"
          count={buckets.esperandoConcentrador.length}
          monto={sum(buckets.esperandoConcentrador)}
          tone="amber"
        />
        <PipelineKpi
          icon={<CheckCircle2 className="h-4 w-4 text-blue-500" />}
          label="En concentrador"
          count={buckets.enConcentradorRecibido.length}
          monto={sum(buckets.enConcentradorRecibido)}
          tone="blue"
        />
        <PipelineKpi
          icon={<Clock className="h-4 w-4 text-amber-500" />}
          label="Esperando DG/DC"
          count={buckets.esperandoFinal.length}
          monto={sum(buckets.esperandoFinal)}
          tone="amber"
        />
        <PipelineKpi
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          label="Cerrado (DG/DC)"
          count={buckets.cerrado.length}
          monto={sum(buckets.cerrado)}
          tone="emerald"
        />
      </div>

      {buckets.rechazado.length > 0 && (
        <PipelineKpi
          icon={<XCircle className="h-4 w-4 text-red-500" />}
          label={`Rechazados (${buckets.rechazado.length})`}
          count={buckets.rechazado.length}
          monto={sum(buckets.rechazado)}
          tone="red"
        />
      )}

      {/* Pipeline por sucursal */}
      <div className="space-y-4">
        {branches.filter((b) => !branchFilter || b.id === branchFilter).map((b) => {
          const branchCortes = cortesFiltrados.filter((c) => c.branchId === b.id)
          if (branchCortes.length === 0) {
            return (
              <div key={b.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{b.nombre}</p>
                    <p className="text-xs text-gray-500">
                      Concentrador: {b.concentrador?.nombre ?? <span className="text-amber-600">sin asignar</span>}
                    </p>
                  </div>
                  <p className="text-xs text-gray-400 italic">Sin cortes esta fecha</p>
                </div>
              </div>
            )
          }
          return (
            <div key={b.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{b.nombre}</p>
                  <p className="text-xs text-gray-500">
                    Concentrador: {b.concentrador?.nombre ?? <span className="text-amber-600">sin asignar</span>}
                  </p>
                </div>
                <p className="text-xs text-gray-500">{branchCortes.length} cortes</p>
              </div>
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-3 py-2">Dueño</th>
                    <th className="text-left px-3 py-2">Receptor</th>
                    <th className="text-right px-3 py-2">Efectivo</th>
                    <th className="text-right px-3 py-2">Tarjeta</th>
                    <th className="text-right px-3 py-2">Transfer</th>
                    <th className="text-right px-3 py-2">A entregar</th>
                    <th className="text-center px-3 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {branchCortes.map((c) => (
                    <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <p className="font-medium text-gray-900">{c.user.nombre}</p>
                        <p className="text-[11px] text-gray-500">{c.user.rol}</p>
                      </td>
                      <td className="px-3 py-2">
                        {c.receptor ? (
                          <>
                            <p className="text-gray-900">{c.receptor.nombre}</p>
                            <p className="text-[11px] text-gray-500">{c.receptor.rol}</p>
                          </>
                        ) : <span className="text-gray-400 text-xs">—</span>}
                      </td>
                      <td className="text-right px-3 py-2 font-mono">${c.totalEfectivoCobrado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                      <td className="text-right px-3 py-2 font-mono text-gray-500">${c.totalTarjetaCobrado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                      <td className="text-right px-3 py-2 font-mono text-gray-500">${c.totalTransferenciaCobrado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                      <td className="text-right px-3 py-2 font-mono font-semibold">${c.totalAEntregar.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                      <td className="text-center px-3 py-2">
                        <EstadoChip estado={c.estado} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PipelineKpi({
  icon, label, count, monto, tone,
}: {
  icon: React.ReactNode; label: string; count: number; monto: number;
  tone: 'gray' | 'amber' | 'blue' | 'emerald' | 'red'
}) {
  const toneClass = {
    gray:    'border-gray-200 bg-white',
    amber:   'border-amber-200 bg-amber-50',
    blue:    'border-blue-200 bg-blue-50',
    emerald: 'border-emerald-200 bg-emerald-50',
    red:     'border-red-200 bg-red-50',
  }[tone]
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-600 flex items-center gap-1.5">{icon}{label}</span>
        <span className="text-xs text-gray-500">{count}</span>
      </div>
      <p className="text-xl font-bold font-mono text-gray-900 mt-1">
        ${monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
      </p>
    </div>
  )
}

function EstadoChip({ estado }: { estado: string }) {
  const cfg: Record<string, { label: string; className: string }> = {
    ABIERTO:   { label: 'En campo',  className: 'bg-gray-100 text-gray-700 border-gray-300' },
    ENTREGADO: { label: 'Pendiente', className: 'bg-amber-50 text-amber-700 border-amber-300' },
    ACEPTADO:  { label: 'Confirmado', className: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
    RECHAZADO: { label: 'Rechazado', className: 'bg-red-50 text-red-700 border-red-300' },
  }
  const c = cfg[estado] ?? cfg.ABIERTO
  return <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${c.className}`}>{c.label}</span>
}
