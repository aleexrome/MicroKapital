'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/use-toast'
import {
  ArrowLeft, ArrowRight, CheckCircle2, XCircle, Search, Wallet,
  TrendingUp, Target, Coins, Loader2, Sparkles,
} from 'lucide-react'

interface NominaCredito {
  id: string
  tipo: 'SOLIDARIO' | 'INDIVIDUAL' | 'AGIL' | 'FIDUCIARIO'
  esRenovacion: boolean
  capital: number
  comision: number
  clienteNombre: string | null
}

type Esquema = 'COLOCACION' | 'COBRANZA'
type Categoria = 'DIAMANTE' | 'ORO' | 'PLATA' | 'ENTRENAMIENTO'

interface NominaEmpleado {
  userId: string
  nombre: string
  rol: string
  sucursal: string | null
  sinFichaRH: boolean
  esquema: Esquema
  perfil: 'JUNIOR' | 'EXCELENCIA' | 'SENIOR' | null
  categoria: Categoria | null
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
  pctIncentivoBase: number
  multiplicadorCobranza: number
  incentivoBase: number
  incentivo: number
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
  /** Solo DG/DC/SUPER_ADMIN pueden cambiar esquema por usuario. */
  puedeToggleEsquema: boolean
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

const CATEGORIA_STYLES: Record<Categoria, { bg: string; text: string; label: string }> = {
  DIAMANTE:      { bg: 'bg-cyan-100',    text: 'text-cyan-800',    label: '💎 Diamante' },
  ORO:           { bg: 'bg-yellow-100',  text: 'text-yellow-800',  label: '🥇 Oro' },
  PLATA:         { bg: 'bg-slate-200',   text: 'text-slate-700',   label: '🥈 Plata' },
  ENTRENAMIENTO: { bg: 'bg-orange-100',  text: 'text-orange-800',  label: '🎓 Entren.' },
}
function CategoriaBadge({ categoria }: { categoria: Categoria | null }) {
  if (!categoria) return <span className="text-muted-foreground italic text-xs">—</span>
  const s = CATEGORIA_STYLES[categoria]
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}>{s.label}</span>
}

export function NominaClient(props: Props) {
  const { nomina, vistaCompleta, semanaLabel, semanaId, semanaAnteriorId, semanaSiguienteId, isCurrent, puedeToggleEsquema } = props
  const router = useRouter()
  const { toast } = useToast()

  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  async function toggleEsquema(userId: string, nuevoEsquema: Esquema) {
    setPendingUserId(userId)
    try {
      const r = await fetch(`/api/nomina/${semanaId}/esquema`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, esquema: nuevoEsquema }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data?.error ?? 'Error al cambiar esquema')
      toast({
        title: 'Esquema actualizado',
        description: `${nuevoEsquema === 'COBRANZA' ? 'Por Cobranza' : 'Por Colocación'} — aplicando cambio…`,
      })
      startTransition(() => router.refresh())
    } catch (err) {
      toast({
        title: 'No se pudo cambiar',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      })
    } finally {
      setPendingUserId(null)
    }
  }

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
                    <th className="text-left py-2 px-2 font-medium">Categoría / Perfil</th>
                    {puedeToggleEsquema && <th className="text-center py-2 px-2 font-medium">Esquema</th>}
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
                        puedeToggleEsquema={puedeToggleEsquema}
                        pendingEsquema={pendingUserId === n.userId}
                        onCambiarEsquema={(nuevo) => toggleEsquema(n.userId, nuevo)}
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
  n, variable, vistaCompleta, isOpen, onToggle, puedeToggleEsquema, pendingEsquema, onCambiarEsquema,
}: {
  n: NominaEmpleado
  variable: number
  vistaCompleta: boolean
  isOpen: boolean
  onToggle: () => void
  puedeToggleEsquema: boolean
  pendingEsquema: boolean
  onCambiarEsquema: (nuevo: Esquema) => void
}) {
  // Total columnas para el colspan del detalle expandido:
  //   base fija: Empleado + Categ/Perfil + Cobranza% + Coloc% + Cumple
  //              + Base + Variable + Total = 8
  //   + Sucursal si vistaCompleta
  //   + Esquema si puedeToggleEsquema
  const colspanDetalle = 8 + (vistaCompleta ? 1 : 0) + (puedeToggleEsquema ? 1 : 0)
  return (
    <>
      <tr className="border-b last:border-0 hover:bg-muted/30 cursor-pointer" onClick={onToggle}>
        <td className="py-2 px-2 font-medium">{n.nombre}</td>
        {vistaCompleta && <td className="py-2 px-2 text-muted-foreground text-xs">{n.sucursal ?? '—'}</td>}
        <td className="py-2 px-2">
          {n.esquema === 'COBRANZA'
            ? <CategoriaBadge categoria={n.categoria} />
            : <PerfilBadge perfil={n.perfil} />
          }
        </td>
        {puedeToggleEsquema && (
          <td className="py-2 px-2 text-center" onClick={(e) => e.stopPropagation()}>
            <EsquemaToggle
              esquema={n.esquema}
              disabled={pendingEsquema}
              onChange={onCambiarEsquema}
            />
          </td>
        )}
        <td className="py-2 px-2 text-right">
          {n.cobranzaPactada > 0 ? (
            <span className={n.cumpleCobranza ? 'text-emerald-700' : 'text-red-600'}>
              {formatPct(n.cobranzaPct)}
            </span>
          ) : <span className="text-muted-foreground text-xs">—</span>}
        </td>
        <td className="py-2 px-2 text-right">
          {n.metaColocacion > 0 && n.esquema === 'COLOCACION' ? (
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
          <td colSpan={colspanDetalle} className="px-2 py-3">
            <DetalleEmpleado n={n} />
          </td>
        </tr>
      )}
    </>
  )
}

/**
 * Switch deslizable Colocación ⇄ Cobranza. Estilo iOS-toggle.
 * Se muestra solo para DG/DC/SUPER_ADMIN.
 */
function EsquemaToggle({
  esquema, disabled, onChange,
}: {
  esquema: Esquema
  disabled: boolean
  onChange: (nuevo: Esquema) => void
}) {
  const esCobranza = esquema === 'COBRANZA'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={esCobranza}
      disabled={disabled}
      onClick={() => onChange(esCobranza ? 'COLOCACION' : 'COBRANZA')}
      className={`
        inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium
        border transition-colors disabled:opacity-50 disabled:cursor-not-allowed
        ${esCobranza
          ? 'bg-violet-100 border-violet-300 text-violet-800 hover:bg-violet-200'
          : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
        }
      `}
      title={`Cambiar a ${esCobranza ? 'Por Colocación' : 'Por Cobranza'}`}
    >
      {disabled
        ? <Loader2 className="h-3 w-3 animate-spin" />
        : <Sparkles className="h-3 w-3" />}
      {esCobranza ? 'Por Cobranza' : 'Por Colocación'}
    </button>
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

  // Esquema COBRANZA: desglose distinto (categoria + incentivo escalado).
  if (n.esquema === 'COBRANZA') return <DetalleEmpleadoCobranza n={n} />
  return <DetalleEmpleadoColocacion n={n} />
}

function DetalleEmpleadoColocacion({ n }: { n: NominaEmpleado }) {
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
          <Coins className="h-3.5 w-3.5" /> Desglose de pago — Por Colocación
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

function DetalleEmpleadoCobranza({ n }: { n: NominaEmpleado }) {
  const multPct = Math.round(n.multiplicadorCobranza * 100)
  const pctIncentivo = (n.pctIncentivoBase * 100).toFixed(1) // 3.5 / 3.0 / 2.5 / 2.0
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <Target className="h-3.5 w-3.5" /> Indicadores
        </div>
        <Linea
          label="Categoría"
          value={n.categoria ?? '—'}
          sub={
            n.categoria === 'DIAMANTE'      ? '≥ $100,000 pactado → 3.5% base'
            : n.categoria === 'ORO'         ? '$75,000 – $99,999 pactado → 3.0% base'
            : n.categoria === 'PLATA'       ? '$20,000 – $74,999 pactado → 2.5% base'
            : n.categoria === 'ENTRENAMIENTO' ? '$0 – $19,999 pactado → 2.0% base'
            : undefined
          }
        />
        <Linea label="Cobranza pactada"  value={formatMoney(n.cobranzaPactada)} />
        <Linea
          label="Cobranza efectiva"
          value={formatMoney(n.cobranzaEfectiva)}
          sub={n.cobranzaPactada > 0 ? `${formatPct(n.cobranzaPct)} de la pactada` : undefined}
          ok={n.multiplicadorCobranza === 1}
        />
        <Linea
          label="Multiplicador cobranza"
          value={`${multPct}%`}
          sub={
            n.multiplicadorCobranza === 1   ? 'Cobranza ≥ 98% → 100% del incentivo'
            : n.multiplicadorCobranza === 0.8 ? 'Cobranza 94-97% → 80% del incentivo'
            : n.multiplicadorCobranza === 0.4 ? 'Cobranza 90-93% → 40% del incentivo'
            : 'Cobranza < 90% → sin incentivo'
          }
          ok={n.multiplicadorCobranza > 0 ? n.multiplicadorCobranza === 1 ? true : undefined : false}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <Coins className="h-3.5 w-3.5" /> Desglose de pago — Por Cobranza
        </div>
        <Linea label="Sueldo base" value={formatMoney2(n.sueldoBase)} />
        <Linea
          label={`Incentivo base (${pctIncentivo}% de pactado)`}
          value={formatMoney2(n.incentivoBase)}
        />
        <Linea
          label={`Incentivo aplicado (×${multPct}%)`}
          value={formatMoney2(n.incentivo)}
          dim={n.incentivo === 0 && n.incentivoBase > 0}
        />
        {n.incentivo === 0 && n.incentivoBase > 0 && (
          <div className="rounded-md bg-red-50 border border-red-200 text-red-800 text-xs p-2">
            Cobranza {formatPct(n.cobranzaPct)} está por debajo del 90% mínimo — solo se paga sueldo base.
          </div>
        )}
        <div className="border-t pt-2 mt-2 flex justify-between items-center font-bold text-base">
          <span>Total a pagar</span>
          <span className="tabular-nums">{formatMoney2(n.totalAPagar)}</span>
        </div>
      </div>
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
