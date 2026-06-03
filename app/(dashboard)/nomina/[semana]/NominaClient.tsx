'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  ArrowLeft, ArrowRight, CheckCircle2, XCircle, Search, AlertCircle, Wallet,
  TrendingUp, Target, Coins,
} from 'lucide-react'

interface NominaCredito {
  id: string
  tipo: 'SOLIDARIO' | 'INDIVIDUAL' | 'AGIL' | 'FIDUCIARIO'
  esRenovacion: boolean
  capital: number
  comision: number
  clienteNombre: string | null
}

interface NominaEmpleado {
  userId: string
  nombre: string
  rol: string
  sucursal: string | null
  sinFichaRH: boolean
  perfil: 'JUNIOR' | 'EXCELENCIA' | 'SENIOR' | null
  sueldoBase: number
  cobranzaPactada: number
  cobranzaEfectiva: number
  cobranzaPct: number
  cumpleCobranza: boolean
  metaColocacion: number
  colocacionReal: number
  colocacionPct: number
  cumpleColocacion: boolean
  creditos: NominaCredito[]
  comisionPorCreditos: number
  bonoCobranzaEfectiva: number
  bonoColocacion: number
  totalAPagar: number
  cumpleGates: boolean
}

interface Props {
  nomina: NominaEmpleado[]
  vistaCompleta: boolean
  semanaLabel: string
  semanaId: string
  semanaAnteriorId: string
  semanaSiguienteId: string
  isCurrent: boolean
  yaCerrada: boolean
  cutoffISO: string
}

function formatMoney(value: number): string {
  return value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
}
function formatMoney2(value: number): string {
  return value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function formatPct(value: number): string {
  return `${Math.round(value * 100)}%`
}

const PERFIL_STYLES: Record<'JUNIOR' | 'EXCELENCIA' | 'SENIOR', { bg: string; text: string; label: string }> = {
  JUNIOR:     { bg: 'bg-amber-100',   text: 'text-amber-800',   label: 'Junior' },
  EXCELENCIA: { bg: 'bg-blue-100',    text: 'text-blue-800',    label: 'Excelencia' },
  SENIOR:     { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Senior' },
}
function PerfilBadge({ perfil }: { perfil: 'JUNIOR' | 'EXCELENCIA' | 'SENIOR' | null }) {
  if (!perfil) return <span className="text-muted-foreground italic text-xs">—</span>
  const s = PERFIL_STYLES[perfil]
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}>{s.label}</span>
}

export function NominaClient(props: Props) {
  const { nomina, vistaCompleta, semanaLabel, semanaAnteriorId, semanaSiguienteId, isCurrent, yaCerrada, cutoffISO } = props

  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const filtrados = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return nomina
    return nomina.filter((n) =>
      [n.nombre, n.sucursal, n.rol].filter(Boolean).some((f) => String(f).toLowerCase().includes(needle)),
    )
  }, [q, nomina])

  const totalSemana = useMemo(() => nomina.reduce((s, n) => s + n.totalAPagar, 0), [nomina])
  const totalBase   = useMemo(() => nomina.reduce((s, n) => s + n.sueldoBase, 0), [nomina])
  const totalVar    = totalSemana - totalBase

  return (
    <div className="p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="h-6 w-6" /> Nómina semanal
          </h1>
          <p className="text-sm text-muted-foreground">{semanaLabel}</p>
        </div>

        {/* Navegación de semana */}
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/nomina/${semanaAnteriorId}`}>
              <ArrowLeft className="h-3 w-3 mr-1" /> Anterior
            </Link>
          </Button>
          {!isCurrent && (
            <Button asChild variant="outline" size="sm">
              <Link href="/nomina">Semana actual</Link>
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href={`/nomina/${semanaSiguienteId}`}>
              Siguiente <ArrowRight className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Aviso de corte */}
      <Card className={`border-l-4 ${yaCerrada ? 'border-l-gray-400 bg-gray-50' : 'border-l-amber-500 bg-amber-50'}`}>
        <CardContent className="p-3 text-sm flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
          <div>
            {yaCerrada ? (
              <span>Semana cerrada — corte aplicado el viernes a las 14:00 CDMX. Cualquier captura posterior no cuenta para esta nómina.</span>
            ) : (
              <span>
                Semana en curso — se cuentan capturas hasta el <strong>viernes 14:00 CDMX</strong>.
                Datos al{' '}
                <strong>
                  {new Date(cutoffISO).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' })}
                </strong>.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Totales (solo en vista de director) */}
      {vistaCompleta && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card><CardContent className="p-4 flex items-center gap-3">
            <Coins className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Sueldos base</p>
              <p className="text-lg font-bold tabular-nums">{formatMoney(totalBase)}</p>
            </div>
          </CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Comisiones + bonos</p>
              <p className="text-lg font-bold tabular-nums">{formatMoney(totalVar)}</p>
            </div>
          </CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-3 bg-primary-50">
            <Wallet className="h-5 w-5 text-primary-500" />
            <div>
              <p className="text-xs text-muted-foreground">Total semana</p>
              <p className="text-lg font-bold tabular-nums text-primary-700">{formatMoney(totalSemana)}</p>
            </div>
          </CardContent></Card>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">
              {vistaCompleta ? 'Desglose por empleado' : 'Mi desglose'}
            </CardTitle>
            {vistaCompleta && (
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre, sucursal..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="pl-9"
                />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {filtrados.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {q ? 'Sin resultados' : 'Aún no hay datos para esta semana.'}
            </p>
          ) : (
            <div className="overflow-x-auto -mx-2 sm:mx-0">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-2 px-2 font-medium">Empleado</th>
                    {vistaCompleta && <th className="text-left py-2 px-2 font-medium">Sucursal</th>}
                    <th className="text-left py-2 px-2 font-medium">Perfil</th>
                    <th className="text-right py-2 px-2 font-medium">Cobranza %</th>
                    <th className="text-right py-2 px-2 font-medium">Colocación %</th>
                    <th className="text-center py-2 px-2 font-medium">Cumple</th>
                    <th className="text-right py-2 px-2 font-medium">Sueldo base</th>
                    <th className="text-right py-2 px-2 font-medium">Variable</th>
                    <th className="text-right py-2 px-2 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((n) => {
                    const isOpen   = openId === n.userId
                    const variable = n.totalAPagar - n.sueldoBase
                    return (
                      <RenglonNomina
                        key={n.userId}
                        n={n}
                        variable={variable}
                        vistaCompleta={vistaCompleta}
                        isOpen={isOpen}
                        onToggle={() => setOpenId(isOpen ? null : n.userId)}
                      />
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function RenglonNomina({
  n, variable, vistaCompleta, isOpen, onToggle,
}: {
  n: NominaEmpleado
  variable: number
  vistaCompleta: boolean
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr className="border-b last:border-0 hover:bg-muted/30 cursor-pointer" onClick={onToggle}>
        <td className="py-2 px-2 font-medium">{n.nombre}</td>
        {vistaCompleta && <td className="py-2 px-2 text-muted-foreground text-xs">{n.sucursal ?? '—'}</td>}
        <td className="py-2 px-2"><PerfilBadge perfil={n.perfil} /></td>
        <td className="py-2 px-2 text-right">
          {n.cobranzaPactada > 0 ? (
            <span className={n.cumpleCobranza ? 'text-emerald-700' : 'text-red-600'}>
              {formatPct(n.cobranzaPct)}
            </span>
          ) : <span className="text-muted-foreground text-xs">—</span>}
        </td>
        <td className="py-2 px-2 text-right">
          {n.metaColocacion > 0 ? (
            <span className={n.cumpleColocacion ? 'text-emerald-700' : 'text-red-600'}>
              {formatPct(n.colocacionPct)}
            </span>
          ) : <span className="text-muted-foreground text-xs">—</span>}
        </td>
        <td className="py-2 px-2 text-center">
          {n.sinFichaRH ? (
            <span className="text-muted-foreground text-xs italic">sin RH</span>
          ) : n.cumpleGates ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500 inline" />
          ) : (
            <XCircle className="h-4 w-4 text-red-500 inline" />
          )}
        </td>
        <td className="py-2 px-2 text-right tabular-nums">{formatMoney(n.sueldoBase)}</td>
        <td className="py-2 px-2 text-right tabular-nums">{formatMoney(variable)}</td>
        <td className="py-2 px-2 text-right tabular-nums font-bold">{formatMoney(n.totalAPagar)}</td>
      </tr>
      {isOpen && (
        <tr className="bg-muted/20">
          <td colSpan={vistaCompleta ? 9 : 8} className="px-2 py-3">
            <DetalleEmpleado n={n} />
          </td>
        </tr>
      )}
    </>
  )
}

function DetalleEmpleado({ n }: { n: NominaEmpleado }) {
  if (n.sinFichaRH) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <strong>{n.nombre}</strong> aún no está dado de alta en Recursos Humanos.
        Una vez que se capture su ficha (sueldo, fecha de entrada, etc.) la nómina arrancará a calcularse.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <Target className="h-3.5 w-3.5" /> Indicadores
        </div>
        <Linea label="Cobranza pactada"  value={formatMoney(n.cobranzaPactada)} />
        <Linea label="Cobranza efectiva" value={formatMoney(n.cobranzaEfectiva)} sub={n.cobranzaPactada > 0 ? `${formatPct(n.cobranzaPct)} de la pactada (mín. 98%)` : undefined} ok={n.cumpleCobranza} />
        <Linea label="Meta de colocación" value={formatMoney(n.metaColocacion)} />
        <Linea
          label="Colocación real"
          value={formatMoney(n.colocacionReal)}
          sub={n.metaColocacion > 0 ? `${formatPct(n.colocacionPct)} de la meta${n.perfil === 'SENIOR' ? ' (no aplica como gate)' : ''}` : undefined}
          ok={n.perfil === 'SENIOR' ? undefined : n.cumpleColocacion}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <Coins className="h-3.5 w-3.5" /> Desglose de pago
        </div>
        <Linea label="Sueldo base" value={formatMoney2(n.sueldoBase)} />
        {n.comisionPorCreditos > 0 && (
          <Linea label={`Comisiones por crédito (${n.creditos.length})`} value={formatMoney2(n.comisionPorCreditos)} dim={!n.cumpleGates} />
        )}
        {n.bonoCobranzaEfectiva > 0 && (
          <Linea
            label={n.perfil === 'SENIOR' ? 'Bono cobranza zona (0.5%)' : 'Bono cobranza (1%)'}
            value={formatMoney2(n.bonoCobranzaEfectiva)}
            dim={!n.cumpleGates}
          />
        )}
        {n.bonoColocacion > 0 && (
          <Linea label="Bono colocación zona (1%)" value={formatMoney2(n.bonoColocacion)} dim={!n.cumpleGates} />
        )}
        {!n.cumpleGates && (n.comisionPorCreditos + n.bonoCobranzaEfectiva + n.bonoColocacion > 0) && (
          <div className="rounded-md bg-red-50 border border-red-200 text-red-800 text-xs p-2">
            No cumplió {!n.cumpleCobranza ? '98% de cobranza' : ''}
            {!n.cumpleCobranza && !n.cumpleColocacion ? ' y ' : ''}
            {!n.cumpleColocacion ? 'meta de colocación' : ''} — solo se paga sueldo base.
          </div>
        )}
        <div className="border-t pt-2 mt-2 flex justify-between items-center font-bold text-base">
          <span>Total a pagar</span>
          <span className="tabular-nums">{formatMoney2(n.totalAPagar)}</span>
        </div>
      </div>

      {n.creditos.length > 0 && (
        <div className="md:col-span-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground mb-2">
            <Badge variant="outline" className="text-[10px] py-0">Colocados esta semana</Badge>
          </div>
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="text-left py-1 px-2">Cliente</th>
                <th className="text-left py-1 px-2">Tipo</th>
                <th className="text-left py-1 px-2">Origen</th>
                <th className="text-right py-1 px-2">Capital</th>
                <th className="text-right py-1 px-2">Comisión</th>
              </tr>
            </thead>
            <tbody>
              {n.creditos.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="py-1 px-2">{c.clienteNombre ?? '—'}</td>
                  <td className="py-1 px-2">{c.tipo}</td>
                  <td className="py-1 px-2">
                    <Badge variant="outline" className="text-[10px] py-0">
                      {c.esRenovacion ? 'Renovación' : 'Nuevo'}
                    </Badge>
                  </td>
                  <td className="py-1 px-2 text-right tabular-nums">{formatMoney(c.capital)}</td>
                  <td className="py-1 px-2 text-right tabular-nums">{formatMoney2(c.comision)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Linea({ label, value, sub, ok, dim }: {
  label: string; value: string; sub?: string; ok?: boolean; dim?: boolean
}) {
  return (
    <div className={`flex items-start justify-between gap-2 ${dim ? 'opacity-40 line-through' : ''}`}>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        {sub && <p className={`text-[11px] ${ok === false ? 'text-red-600' : ok ? 'text-emerald-600' : 'text-muted-foreground'}`}>{sub}</p>}
      </div>
      <p className="tabular-nums font-medium">{value}</p>
    </div>
  )
}
