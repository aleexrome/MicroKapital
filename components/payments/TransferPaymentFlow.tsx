'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Camera, Check, Clock, Copy, Loader2, RefreshCw, Upload } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import { BankAccountCard } from './BankAccountCard'

interface BankAccount {
  id:           string
  banco:        string
  titular:      string
  clabe:        string
  numeroCuenta: string
}

interface TransferPaymentFlowProps {
  /** Préstamo contra el que se registrará el pago. */
  loanId:        string
  /**
   * Tipo del pago que detona el flujo. Debe coincidir con lo que el
   * backend acepta en TransferCode.tipo + lo que el endpoint que recibe
   * el `transferCodeId` espera.
   */
  tipo:          'PAYMENT' | 'COMISION_APERTURA' | 'GROUP_PAYMENT'
  /** Monto que debería llegar al banco. Se guarda en TransferCode para auditoría. */
  montoEsperado: number
  /** Para `tipo: 'PAYMENT'` — el schedule que paga esta cuota. */
  scheduleId?:   string | null
  /** Para `tipo: 'GROUP_PAYMENT'` — el grupo que paga. */
  groupId?:      string | null
  /**
   * Callback cuando el flujo está completo (código generado + foto
   * subida). El parent llama a su endpoint de registrar pago con el
   * `transferCodeId` recibido aquí.
   *
   * `referenciaBanco` es el número / ID del banco (ej. autorización SPEI)
   * que el cliente le dicta al cobrador después de hacer la transferencia.
   * Es opcional — si no se puso, viene string vacío.
   */
  onReady:       (data: { transferCodeId: string; code: string; referenciaBanco: string }) => void
  /** Callback cuando el flujo se "des-arma" (el coord vuelve atrás). */
  onReset?:      () => void
}

type Step = 'account' | 'code' | 'photo'

/**
 * Flujo de 3 pasos para capturar un pago por transferencia con código
 * de verificación único (Fase 1):
 *
 *   1. Tarjetas de cuentas destino (BankAccountCard).
 *   2. Código generado por el backend + instrucciones + botón "copiar".
 *   3. Upload del screenshot del comprobante.
 *
 * El componente es reutilizable: se mete tal cual dentro del dialog
 * de registrar pago (amortización / comisión / grupal). Cuando los 3
 * pasos están listos, invoca `onReady({transferCodeId})` y el parent
 * habilita su botón "Registrar pago" para enviar al endpoint.
 *
 * Regenerar: si la coord decide cambiar de cuenta, el componente
 * descarta el código actual y pide uno nuevo al backend (que a su vez
 * invalida el anterior en BD). La foto se descarta también.
 */
export function TransferPaymentFlow({
  loanId,
  tipo,
  montoEsperado,
  scheduleId,
  groupId,
  onReady,
  onReset,
}: TransferPaymentFlowProps) {
  const { toast } = useToast()
  const [accounts, setAccounts]           = useState<BankAccount[]>([])
  const [cargandoAccounts, setCargandoAccounts] = useState(true)
  const [step, setStep]                   = useState<Step>('account')
  const [selectedAccountId, setSelected]  = useState<string | null>(null)
  const [generatingCode, setGenerating]   = useState(false)
  const [codeInfo, setCodeInfo]           = useState<{ id: string; code: string; expiresAt: string } | null>(null)
  const [codigoCopiado, setCodigoCopiado] = useState(false)
  const [uploading, setUploading]         = useState(false)
  const [fotoUrl, setFotoUrl]             = useState<string | null>(null)
  const [referenciaBanco, setReferenciaBanco] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch de cuentas al montar — reusa el endpoint existente que ya
  // filtra por branch (el que usa el sitio para dropdowns de pago).
  useEffect(() => {
    let cancelado = false
    async function cargar() {
      try {
        const res = await fetch(`/api/bank-accounts?loanId=${encodeURIComponent(loanId)}`)
        if (!res.ok) throw new Error('no_accounts')
        const body = await res.json()
        if (cancelado) return
        // El endpoint devuelve { data: [...] }; aceptamos también el
        // formato plano por si alguien lo cambia en el futuro.
        setAccounts(Array.isArray(body) ? body : (body.data ?? body.accounts ?? []))
      } catch {
        if (!cancelado) setAccounts([])
      } finally {
        if (!cancelado) setCargandoAccounts(false)
      }
    }
    cargar()
    return () => { cancelado = true }
  }, [loanId])

  // Contador regresivo del código. Lo actualizamos cada 10s — no necesita
  // ser al segundo (al final la validación la hace el server).
  const [tiempoRestante, setTiempoRestante] = useState('')
  useEffect(() => {
    if (!codeInfo) { setTiempoRestante(''); return }
    function tick() {
      const diff = new Date(codeInfo!.expiresAt).getTime() - Date.now()
      if (diff <= 0) { setTiempoRestante('Expirado'); return }
      const h = Math.floor(diff / 3_600_000)
      const m = Math.floor((diff % 3_600_000) / 60_000)
      setTiempoRestante(`${h}h ${m.toString().padStart(2, '0')}m`)
    }
    tick()
    const id = setInterval(tick, 10_000)
    return () => clearInterval(id)
  }, [codeInfo])

  const seleccionada = useMemo(
    () => accounts.find((a) => a.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId],
  )

  async function elegirCuenta(cuentaId: string) {
    setSelected(cuentaId)
    setGenerating(true)
    try {
      const res = await fetch('/api/transfer-codes', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          loanId,
          cuentaDestinoId: cuentaId,
          montoEsperado,
          tipo,
          scheduleId: scheduleId ?? null,
          groupId:    groupId ?? null,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : 'No se pudo generar el código')
      setCodeInfo({ id: body.id, code: body.code, expiresAt: body.expiresAt })
      setFotoUrl(null)
      setStep('code')
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'No se pudo generar el código',
        variant: 'destructive',
      })
      setSelected(null)
    } finally {
      setGenerating(false)
    }
  }

  function volverAEleccion() {
    setStep('account')
    setSelected(null)
    setCodeInfo(null)
    setFotoUrl(null)
    onReset?.()
  }

  async function copiarCodigo() {
    if (!codeInfo) return
    try {
      await navigator.clipboard.writeText(codeInfo.code)
      setCodigoCopiado(true)
      setTimeout(() => setCodigoCopiado(false), 1500)
    } catch {
      // ignore
    }
  }

  function onPickFile() {
    fileInputRef.current?.click()
  }

  async function onFileSelected(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0]
    ev.target.value = ''
    if (!file || !codeInfo) return
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Solo imágenes', variant: 'destructive' })
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('foto', file)
      const res = await fetch(`/api/transfer-codes/${codeInfo.id}/upload-foto`, {
        method: 'POST',
        body:   fd,
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : 'No se pudo subir la foto')
      setFotoUrl(body.comprobanteFotoUrl)
      // Avisar al parent que el flujo quedó listo. El referenciaBanco
      // se envía con el valor actual (puede estar vacío si aún no lo
      // escribió — el parent re-llamará a onReady al cambiarlo).
      onReady({ transferCodeId: codeInfo.id, code: codeInfo.code, referenciaBanco: referenciaBanco.trim() })
    } catch (e) {
      toast({
        title: 'Error al subir',
        description: e instanceof Error ? e.message : 'Error',
        variant: 'destructive',
      })
    } finally {
      setUploading(false)
    }
  }

  const avanzarAPhoto = useCallback(() => setStep('photo'), [])

  // ─────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────

  if (cargandoAccounts) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Cargando cuentas...
      </div>
    )
  }

  if (accounts.length === 0) {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
        No hay cuentas bancarias configuradas para esta sucursal. Pídele a Dirección que las agregue en Admin → Cuentas bancarias.
      </div>
    )
  }

  if (step === 'account' || !codeInfo) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-white">¿A qué cuenta transfirió el cliente?</p>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {accounts.map((acc) => (
            <BankAccountCard
              key={acc.id}
              banco={acc.banco}
              titular={acc.titular}
              clabe={acc.clabe}
              numeroCuenta={acc.numeroCuenta}
              selected={selectedAccountId === acc.id}
              disabled={generatingCode}
              onSelect={() => elegirCuenta(acc.id)}
            />
          ))}
        </div>
        {generatingCode && (
          <p className="text-xs text-gray-400 flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Generando código...
          </p>
        )}
      </div>
    )
  }

  if (step === 'code') {
    return (
      <div className="space-y-4">
        {/* Resumen cuenta */}
        {seleccionada && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-700 bg-gray-900/60 p-3">
            <div className="min-w-0">
              <p className="text-xs text-gray-400 uppercase tracking-wider">Cuenta destino</p>
              <p className="text-sm font-semibold text-white truncate">{seleccionada.banco} — {seleccionada.titular}</p>
              <p className="text-xs font-mono text-gray-400">CLABE: {seleccionada.clabe}</p>
            </div>
            <Button variant="outline" size="sm" onClick={volverAEleccion}>
              <RefreshCw className="h-3.5 w-3.5" />
              Cambiar
            </Button>
          </div>
        )}

        {/* Código grande */}
        <div className="rounded-xl border-2 border-fuchsia-500/50 bg-gradient-to-br from-fuchsia-500/10 to-purple-500/10 p-5 text-center">
          <p className="text-xs uppercase tracking-wider text-fuchsia-300 mb-2">Código de referencia</p>
          <div className="flex items-center justify-center gap-3">
            <p className="text-3xl font-black font-mono text-white tracking-wider select-all">
              {codeInfo.code}
            </p>
            <button
              type="button"
              onClick={copiarCodigo}
              className={`rounded-lg p-2 transition-colors ${
                codigoCopiado ? 'bg-emerald-500/20 text-emerald-300' : 'bg-fuchsia-500/20 text-fuchsia-200 hover:bg-fuchsia-500/30'
              }`}
            >
              {codigoCopiado ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
            </button>
          </div>
          <p className="mt-3 text-xs text-gray-300 flex items-center justify-center gap-1">
            <Clock className="h-3 w-3" /> Expira en {tiempoRestante}
          </p>
        </div>

        {/* Instrucciones */}
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-200 space-y-1">
          <p className="font-semibold text-blue-100">Instrucciones para el cliente:</p>
          <ol className="list-decimal list-inside space-y-0.5 pl-1">
            <li>Entrar a la banca móvil</li>
            <li>Transferir ${montoEsperado.toFixed(2)} a la CLABE de la cuenta seleccionada</li>
            <li><strong>Pegar el código <span className="font-mono text-fuchsia-300">{codeInfo.code}</span> en el campo CONCEPTO</strong></li>
            <li>Confirmar y guardar el comprobante</li>
          </ol>
        </div>

        <Button className="w-full" onClick={avanzarAPhoto}>
          Ya hizo la transferencia — subir foto <Upload className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  // step === 'photo'
  return (
    <div className="space-y-4">
      {/* Resumen compacto */}
      <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-700 bg-gray-900/60 p-3">
        <div className="min-w-0">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Código</p>
          <p className="text-sm font-mono font-bold text-fuchsia-300">{codeInfo.code}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setStep('code')}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Atrás
        </Button>
      </div>

      {/* Upload area */}
      {!fotoUrl ? (
        <div className="rounded-xl border-2 border-dashed border-gray-600 p-6 text-center space-y-3">
          <Camera className="h-10 w-10 text-gray-500 mx-auto" />
          <p className="text-sm text-gray-300">
            Sube el screenshot del comprobante de transferencia
          </p>
          <p className="text-xs text-gray-500">
            El código <span className="font-mono text-fuchsia-300">{codeInfo.code}</span> debe aparecer en el concepto
          </p>
          <Button onClick={onPickFile} disabled={uploading} className="w-full">
            {uploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Subiendo...</> : <><Upload className="h-4 w-4" /> Seleccionar foto</>}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFileSelected}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-emerald-500/40 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fotoUrl} alt="Comprobante" className="w-full h-auto max-h-72 object-contain bg-black/40" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-emerald-300 flex items-center gap-1">
              <Check className="h-3.5 w-3.5" /> Comprobante subido
            </p>
            <Button variant="outline" size="sm" onClick={onPickFile} disabled={uploading}>
              Cambiar foto
            </Button>
          </div>

          {/* ID / número del banco opcional — queda al final porque muchos
              clientes no lo capturan al momento. */}
          <div className="space-y-1.5 pt-2 border-t border-gray-700">
            <label className="block text-xs text-gray-300">
              ID / número de la transferencia bancaria <span className="text-gray-500">(opcional)</span>
            </label>
            <input
              type="text"
              className="w-full rounded-md bg-gray-900 border border-gray-700 px-2 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-fuchsia-500"
              placeholder="Ej. 12345678 (autorización SPEI del banco)"
              value={referenciaBanco}
              onChange={(e) => {
                const v = e.target.value
                setReferenciaBanco(v)
                // Re-emitir al parent con el nuevo valor del campo de banco.
                if (codeInfo) {
                  onReady({ transferCodeId: codeInfo.id, code: codeInfo.code, referenciaBanco: v.trim() })
                }
              }}
            />
            <p className="text-[11px] text-gray-500">
              Si el cliente te comparte el número que le dio su banca al confirmar
              la transferencia, cópialo aquí para auditoría.
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFileSelected}
          />
        </div>
      )}
    </div>
  )
}
