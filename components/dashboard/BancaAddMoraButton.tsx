'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { AlertTriangle, Loader2, X, Search } from 'lucide-react'
import { formatMoney } from '@/lib/utils'

/** Minimalista — solo lo que el combobox necesita del cliente. */
interface ClienteMin {
  id:             string
  nombreCompleto: string
  branchNombre?:  string | null
}

interface ScheduleMin {
  id:               string
  numeroPago:       number
  fechaVencimiento: string
  estado:           string
  montoEsperado:    number
  montoPagado:      number
  tieneMulta:       boolean
  tieneMora:        boolean
}

interface LoanMin {
  id:              string
  tipo:            string
  capital:         number
  estado:          string
  fechaDesembolso: string | null
  branch:          { id: string; nombre: string } | null
  schedule:        ScheduleMin[]
}

interface CuentaBanco {
  id:     string
  nombre: string
  banco?: string | null
}

interface Props {
  /** Cuentas bancarias de la empresa — solo se usan si DG escoge TRANSFER. */
  cuentasBanco?: CuentaBanco[]
}

/**
 * Botón "+ Agregar mora" para la vista /banca. Solo lo monta DG/DC/SA.
 * Abre modal con autocomplete de cliente → préstamos → cuota → tipo
 * (MULTA/MORA) → monto → método (CASH/TRANSFER). Queda cobrada en el
 * acto: POST /api/banca/mora crea Payment + MoraCobro + CashRegister
 * en una sola transacción.
 */
export function BancaAddMoraButton({ cuentasBanco = [] }: Props) {
  const router = useRouter()
  const { toast } = useToast()

  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Búsqueda de cliente
  const [q, setQ] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [resultados, setResultados] = useState<ClienteMin[]>([])
  const [cliente, setCliente] = useState<ClienteMin | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Préstamos del cliente
  const [loans, setLoans] = useState<LoanMin[]>([])
  const [cargandoLoans, setCargandoLoans] = useState(false)
  const [loanId, setLoanId] = useState<string>('')
  const [scheduleId, setScheduleId] = useState<string>('')

  // Detalles de la mora
  const [tipo, setTipo] = useState<'MULTA' | 'MORA'>('MULTA')
  const [monto, setMonto] = useState('')
  const [metodoPago, setMetodoPago] = useState<'CASH' | 'TRANSFER'>('CASH')
  const [cuentaDestinoId, setCuentaDestinoId] = useState<string>(cuentasBanco[0]?.id ?? '')
  const [idTransferencia, setIdTransferencia] = useState('')
  const [referenciaBanco, setReferenciaBanco] = useState('')
  const [notas, setNotas] = useState('')

  // Reset total
  function reset() {
    setQ('')
    setResultados([])
    setCliente(null)
    setLoans([])
    setLoanId('')
    setScheduleId('')
    setTipo('MULTA')
    setMonto('')
    setMetodoPago('CASH')
    setCuentaDestinoId(cuentasBanco[0]?.id ?? '')
    setIdTransferencia('')
    setReferenciaBanco('')
    setNotas('')
  }

  // Autocomplete clientes (300ms debounce)
  useEffect(() => {
    if (cliente) return  // ya hay uno elegido, no sigas buscando
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.trim().length < 2) {
      setResultados([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      setBuscando(true)
      try {
        const res = await fetch(`/api/clients?q=${encodeURIComponent(q.trim())}&limit=10`)
        if (!res.ok) throw new Error('No se pudo buscar')
        const data = await res.json()
        const items = (data?.data ?? data?.items ?? data?.clients ?? []) as Array<{
          id: string; nombreCompleto: string; branch?: { nombre: string } | null
        }>
        setResultados(items.map((c) => ({
          id:             c.id,
          nombreCompleto: c.nombreCompleto,
          branchNombre:   c.branch?.nombre ?? null,
        })))
      } catch {
        setResultados([])
      } finally {
        setBuscando(false)
      }
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [q, cliente])

  // Cuando se selecciona cliente: cargar préstamos activos
  useEffect(() => {
    if (!cliente) {
      setLoans([])
      setLoanId('')
      setScheduleId('')
      return
    }
    setCargandoLoans(true)
    fetch(`/api/banca/mora?clientId=${encodeURIComponent(cliente.id)}`)
      .then(async (r) => {
        const raw = await r.text()
        const d = raw ? JSON.parse(raw) : {}
        if (!r.ok) throw new Error(d.error ?? `Error ${r.status}`)
        setLoans(d.loans ?? [])
        if (d.loans?.length === 1) setLoanId(d.loans[0].id)
      })
      .catch((e) => {
        toast({ title: 'Error', description: String(e), variant: 'destructive' })
        setLoans([])
      })
      .finally(() => setCargandoLoans(false))
  }, [cliente, toast])

  const loan = loans.find((l) => l.id === loanId)
  const schedulesDisponibles = (loan?.schedule ?? []).filter(
    (s) => tipo === 'MULTA' ? !s.tieneMulta : !s.tieneMora,
  )
  const schedule = loan?.schedule.find((s) => s.id === scheduleId)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const montoNum = Number(monto)
    if (!cliente)                           { toast({ title: 'Elige un cliente', variant: 'destructive' }); return }
    if (!loanId)                            { toast({ title: 'Elige un préstamo', variant: 'destructive' }); return }
    if (!scheduleId)                        { toast({ title: 'Elige una cuota',   variant: 'destructive' }); return }
    if (!Number.isFinite(montoNum) || montoNum <= 0) { toast({ title: 'Monto inválido', variant: 'destructive' }); return }
    if (metodoPago === 'TRANSFER' && !cuentaDestinoId) {
      toast({ title: 'Elige cuenta destino', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/banca/mora', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId:        cliente.id,
          loanId,
          scheduleId,
          tipo,
          monto:           montoNum,
          metodoPago,
          ...(metodoPago === 'TRANSFER' ? {
            cuentaDestinoId,
            idTransferencia: idTransferencia.trim() || undefined,
            referenciaBanco: referenciaBanco.trim() || undefined,
          } : {}),
          notas: notas.trim() || undefined,
        }),
      })
      const raw = await res.text()
      const d = raw ? JSON.parse(raw) : {}
      if (!res.ok) throw new Error(d.error ?? `Error ${res.status}`)
      toast({
        title: `${tipo} registrada`,
        description: `${cliente.nombreCompleto} · cuota #${schedule?.numeroPago} · ${formatMoney(montoNum)}`,
      })
      setOpen(false)
      reset()
      router.refresh()
    } catch (e) {
      toast({
        title: 'Error al registrar',
        description: e instanceof Error ? e.message : 'Error',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-amber-600 hover:bg-amber-700 text-white"
      >
        <AlertTriangle className="h-4 w-4" />
        Agregar mora
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !saving && setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Registrar MULTA / MORA</h2>
                <p className="text-xs text-muted-foreground">
                  Queda cobrada en el acto, ligada a la cuota del cliente.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !saving && setOpen(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={submit} className="space-y-3">
              {/* ── Cliente ─────────────────────────────────────────────── */}
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Cliente</label>
                {cliente ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-primary-500/40 bg-primary-500/10 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{cliente.nombreCompleto}</p>
                      {cliente.branchNombre && (
                        <p className="text-[11px] text-muted-foreground truncate">{cliente.branchNombre}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => { setCliente(null); setQ('') }}
                      className="text-xs text-rose-400 hover:text-rose-300 shrink-0"
                    >
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <input
                        autoFocus
                        type="text"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Nombre del cliente (mín. 2 letras)"
                        className="w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                    {q.trim().length >= 2 && (
                      <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-background">
                        {buscando && <p className="px-3 py-2 text-xs text-muted-foreground">Buscando…</p>}
                        {!buscando && resultados.length === 0 && (
                          <p className="px-3 py-2 text-xs text-muted-foreground">Sin resultados</p>
                        )}
                        {resultados.map((c) => (
                          <button
                            type="button"
                            key={c.id}
                            onClick={() => { setCliente(c); setQ(''); setResultados([]) }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-secondary"
                          >
                            <p className="font-medium">{c.nombreCompleto}</p>
                            {c.branchNombre && (
                              <p className="text-[11px] text-muted-foreground">{c.branchNombre}</p>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── Tipo (MULTA/MORA) ───────────────────────────────────── */}
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Tipo</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['MULTA', 'MORA'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => { setTipo(t); setScheduleId('') }}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        tipo === t
                          ? 'border-amber-500 bg-amber-500/15 text-amber-200'
                          : 'border-input bg-background text-muted-foreground hover:bg-secondary'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Préstamo + cuota ────────────────────────────────────── */}
              {cliente && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Préstamo</label>
                    {cargandoLoans ? (
                      <p className="text-xs text-muted-foreground">Cargando préstamos…</p>
                    ) : loans.length === 0 ? (
                      <p className="text-xs text-rose-400">Cliente sin préstamos activos.</p>
                    ) : (
                      <select
                        value={loanId}
                        onChange={(e) => { setLoanId(e.target.value); setScheduleId('') }}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        required
                      >
                        <option value="">— Elige préstamo —</option>
                        {loans.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.tipo} · {formatMoney(l.capital)} · {l.branch?.nombre ?? '—'}
                            {l.estado !== 'ACTIVE' ? ` (${l.estado})` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {loan && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        Cuota (sin {tipo.toLowerCase()} previa)
                      </label>
                      {schedulesDisponibles.length === 0 ? (
                        <p className="text-xs text-rose-400">
                          Este préstamo ya tiene {tipo} en todas sus cuotas.
                        </p>
                      ) : (
                        <select
                          value={scheduleId}
                          onChange={(e) => setScheduleId(e.target.value)}
                          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          required
                        >
                          <option value="">— Elige cuota —</option>
                          {schedulesDisponibles.map((s) => (
                            <option key={s.id} value={s.id}>
                              #{s.numeroPago} · vence {new Date(s.fechaVencimiento).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })} · {s.estado} · {formatMoney(s.montoEsperado)}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* ── Monto ───────────────────────────────────────────────── */}
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Monto (MXN)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder={tipo === 'MULTA' ? '200.00' : '500.00'}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  required
                />
              </div>

              {/* ── Método ──────────────────────────────────────────────── */}
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Método</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['CASH', 'TRANSFER'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMetodoPago(m)}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        metodoPago === m
                          ? 'border-primary-500 bg-primary-500/15 text-primary-200'
                          : 'border-input bg-background text-muted-foreground hover:bg-secondary'
                      }`}
                    >
                      {m === 'CASH' ? 'Efectivo' : 'Transferencia'}
                    </button>
                  ))}
                </div>
              </div>

              {metodoPago === 'TRANSFER' && cuentasBanco.length > 0 && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Cuenta destino</label>
                    <select
                      value={cuentaDestinoId}
                      onChange={(e) => setCuentaDestinoId(e.target.value)}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      required
                    >
                      <option value="">— Elige cuenta —</option>
                      {cuentasBanco.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}{c.banco ? ` · ${c.banco}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={idTransferencia}
                      onChange={(e) => setIdTransferencia(e.target.value)}
                      placeholder="ID transferencia (opcional)"
                      maxLength={100}
                      className="rounded-lg border border-input bg-background px-3 py-2 text-xs"
                    />
                    <input
                      type="text"
                      value={referenciaBanco}
                      onChange={(e) => setReferenciaBanco(e.target.value)}
                      placeholder="Referencia banco (opcional)"
                      maxLength={100}
                      className="rounded-lg border border-input bg-background px-3 py-2 text-xs"
                    />
                  </div>
                </>
              )}

              {/* ── Notas ───────────────────────────────────────────────── */}
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Notas (opcional)</label>
                <input
                  type="text"
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Motivo / observación"
                  maxLength={300}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => !saving && setOpen(false)} disabled={saving}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={saving || !cliente || !loanId || !scheduleId}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Registrar'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
