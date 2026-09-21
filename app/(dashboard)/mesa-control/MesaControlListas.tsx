'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatMoney, formatDate } from '@/lib/utils'
import { AlertTriangle, ClipboardList, CheckCircle, Building2, User, RotateCcw, Video } from 'lucide-react'
import { DesembolsosVideoList, type DesembolsoVideoRow } from './DesembolsosVideoList'

export interface MesaControlLoan {
  id: string
  tipo: string
  capital: string           // Decimal serializado
  createdAt: string         // ISO
  notas: string | null
  revisadoAt: string | null // ISO
  revisionNotasGenerales: string | null
  client: { id: string; nombreCompleto: string }
  cobrador: { nombre: string }
  branchNombre: string | null
}

/**
 * Agrupa loans por sucursal → coordinador preservando el orden que
 * ya trae el array (viene ordenado desde el server).
 */
function agrupar(loans: MesaControlLoan[]) {
  const porSucursal = new Map<string, Map<string, MesaControlLoan[]>>()
  for (const loan of loans) {
    const sucursal = loan.branchNombre ?? 'Sin sucursal'
    const coordinador = loan.cobrador.nombre
    if (!porSucursal.has(sucursal)) porSucursal.set(sucursal, new Map())
    const porCoordinador = porSucursal.get(sucursal)!
    if (!porCoordinador.has(coordinador)) porCoordinador.set(coordinador, [])
    porCoordinador.get(coordinador)!.push(loan)
  }
  return Array.from(porSucursal.entries()).map(([sucursal, coordinadores]) => ({
    sucursal,
    coordinadores: Array.from(coordinadores.entries()).map(([coordinador, loans]) => ({
      coordinador,
      loans,
    })),
    total: Array.from(coordinadores.values()).reduce((s, ls) => s + ls.length, 0),
  }))
}

interface Props {
  pendientes: MesaControlLoan[]
  regresadas: MesaControlLoan[]
  desembolsosVideo: DesembolsoVideoRow[]
}

type ActiveTab = 'PENDIENTE' | 'REGRESADA' | 'DESEMBOLSOS_VIDEO'

/**
 * Bloque inferior de /mesa-control con las listas organizadas en tabs:
 *   - "Por revisar" (PENDING_REVIEW)
 *   - "Regresadas al coordinador" (RETURNED_TO_COORDINATOR)
 *   - "Desembolsos con video" (auditoria: loans con video subido o con
 *     intentos rechazados). MC ve el dia a dia; DG y DC entran a
 *     supervisar cuando quieran.
 */
export function MesaControlListas({ pendientes, regresadas, desembolsosVideo }: Props) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('PENDIENTE')

  const grupos = activeTab === 'PENDIENTE'
    ? agrupar(pendientes)
    : activeTab === 'REGRESADA'
    ? agrupar(regresadas)
    : []
  const variante = activeTab === 'PENDIENTE' ? 'pendiente' : 'regresada'
  const cuenta = activeTab === 'PENDIENTE'
    ? pendientes.length
    : activeTab === 'REGRESADA'
    ? regresadas.length
    : desembolsosVideo.length

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {([
          { key: 'PENDIENTE',         label: 'Por revisar',              count: pendientes.length,      icon: <AlertTriangle className="h-4 w-4" />, color: 'text-yellow-500' },
          { key: 'REGRESADA',         label: 'Regresadas al coordinador', count: regresadas.length,      icon: <ClipboardList className="h-4 w-4" />, color: 'text-blue-500' },
          { key: 'DESEMBOLSOS_VIDEO', label: 'Desembolsos con video',     count: desembolsosVideo.length, icon: <Video className="h-4 w-4" />,        color: 'text-emerald-500' },
        ] as const).map((tab) => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <span className={isActive ? tab.color : ''}>{tab.icon}</span>
              <span>{tab.label}</span>
              <span className={`inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full text-xs font-semibold ${
                isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              }`}>
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Contenido — la tab "Desembolsos con video" se pinta por
          separado porque su UI es distinta (auditoría con filtros y
          card individual por intento, no agrupación por sucursal). */}
      {activeTab === 'DESEMBOLSOS_VIDEO' ? (
        <DesembolsosVideoList rows={desembolsosVideo} />
      ) : cuenta === 0 ? (
        <Card>
          <CardContent className="text-center py-8 text-muted-foreground">
            {activeTab === 'PENDIENTE' ? (
              <>
                <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                No hay solicitudes pendientes de revisión.
              </>
            ) : (
              <>
                <RotateCcw className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                Ninguna solicitud regresada por el momento.
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {grupos.map((grupo) => (
            <div key={grupo.sucursal} className="space-y-3">
              <div className="flex items-center gap-2 border-b border-gray-200 pb-1.5">
                <Building2 className="h-4 w-4 text-primary-700" />
                <h3 className="font-semibold text-gray-900">{grupo.sucursal}</h3>
                <span className="text-xs text-muted-foreground">({grupo.total})</span>
              </div>
              {grupo.coordinadores.map(({ coordinador, loans }) => (
                <div key={coordinador} className="space-y-2 ml-2">
                  <div className="flex items-center gap-1.5 text-sm">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium text-gray-700">{coordinador}</span>
                    <span className="text-xs text-muted-foreground">({loans.length})</span>
                  </div>
                  <div className="space-y-2 ml-1">
                    {loans.map((loan) => (
                      <Link key={loan.id} href={`/prestamos/${loan.id}`}>
                        <Card className="hover:bg-gray-50 transition-colors cursor-pointer">
                          <CardContent className="p-4">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold">{loan.client.nombreCompleto}</span>
                              <Badge variant={variante === 'regresada' ? 'default' : 'warning'}>
                                {variante === 'regresada' ? 'Regresada' : loan.tipo}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm mt-1">
                              <div>
                                <span className="text-muted-foreground">Capital:</span>{' '}
                                <span className="font-medium money">{formatMoney(Number(loan.capital))}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">
                                  {variante === 'regresada' ? 'Regresada:' : 'Solicitado:'}
                                </span>{' '}
                                {variante === 'regresada'
                                  ? loan.revisadoAt
                                    ? formatDate(loan.revisadoAt)
                                    : '—'
                                  : formatDate(loan.createdAt)}
                              </div>
                            </div>
                            {variante === 'regresada' && loan.revisionNotasGenerales && (
                              <p className="text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded p-2 mt-2 whitespace-pre-wrap">
                                {loan.revisionNotasGenerales}
                              </p>
                            )}
                            {variante === 'pendiente' && loan.notas && (
                              <p className="text-sm text-muted-foreground italic mt-2">{loan.notas}</p>
                            )}
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
