'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Banknote, Coins, Loader2, Send } from 'lucide-react'

interface ArqueoCapturaFormProps {
  arqueoId:        string
  denominaciones:  number[]   // en pesos; 0.5 = 50¢
}

/**
 * Formulario que el usuario target completa durante un arqueo
 * sorpresivo. Pide:
 *   - Desglose: cantidad de piezas por cada denominación MXN.
 *   - Total declarado de transferencias de la semana MK en curso
 *     (de memoria — por eso es "sorpresivo"; el user NO ve lo que
 *     el sistema calcula hasta después).
 *
 * Al enviar, llama a /api/arqueos/[arqueoId]/capturar. El backend
 * calcula el total declarado del efectivo a partir del desglose, hace
 * snapshot del esperado, y libera la pantalla congelada (router.push
 * a /dashboard).
 */
export function ArqueoCapturaForm({ arqueoId, denominaciones }: ArqueoCapturaFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [cantidades, setCantidades] = useState<Record<string, string>>({})
  const [transferTxt, setTransferTxt] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [confirmado, setConfirmado] = useState(false)

  // Billetes vs monedas (visual) — billetes >= 20 son los papelitos, el
  // "20" se duplica si querés tener ambos; aquí tratamos >=20 como
  // billetes y <20 como monedas, salvo cuando se repite 20 en la lista.
  // La lista llega ordenada (billetes grandes primero, monedas al final).
  const billetes = useMemo(
    () => denominaciones.slice(0, 6),  // 1000, 500, 200, 100, 50, 20
    [denominaciones],
  )
  const monedas = useMemo(
    () => denominaciones.slice(6),     // 20 (moneda), 10, 5, 2, 1, 0.5
    [denominaciones],
  )

  const totalEfectivo = useMemo(() => {
    let total = 0
    // Billetes: index 0..5
    billetes.forEach((d, i) => {
      total += d * (parseInt(cantidades[`b-${i}`] ?? '0', 10) || 0)
    })
    monedas.forEach((d, i) => {
      total += d * (parseInt(cantidades[`m-${i}`] ?? '0', 10) || 0)
    })
    return total
  }, [cantidades, billetes, monedas])

  const transferNum = useMemo(() => {
    const n = Number(transferTxt.replace(/[^0-9.]/g, ''))
    return isNaN(n) ? 0 : n
  }, [transferTxt])

  const totalCombinado = totalEfectivo + transferNum

  function setQty(key: string, raw: string) {
    const clean = raw.replace(/[^0-9]/g, '').slice(0, 5)
    setCantidades((prev) => ({ ...prev, [key]: clean }))
  }

  async function enviarCaptura() {
    setEnviando(true)
    try {
      const desglose = [
        ...billetes.map((d, i) => ({ denominacion: d, cantidad: parseInt(cantidades[`b-${i}`] ?? '0', 10) || 0 })),
        ...monedas.map((d, i)  => ({ denominacion: d, cantidad: parseInt(cantidades[`m-${i}`] ?? '0', 10) || 0 })),
      ].filter((e) => e.cantidad > 0)

      const res = await fetch(`/api/arqueos/${arqueoId}/capturar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          desgloseEfectivo: desglose,
          totalTransferenciasDeclarado: transferNum,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Error al enviar')
      toast({ title: 'Arqueo capturado', description: 'Gracias, ya puedes continuar.' })
      router.push('/dashboard')
      router.refresh()
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Error',
        variant: 'destructive',
      })
      setConfirmado(false)
    } finally {
      setEnviando(false)
    }
  }

  function renderInput(key: string, denom: number) {
    const subtotal = denom * (parseInt(cantidades[key] ?? '0', 10) || 0)
    return (
      <div key={key} className="flex items-center gap-2 rounded-md border border-gray-700 bg-black/30 p-2">
        <span className="w-14 text-right font-mono text-sm text-gray-200">
          ${denom < 1 ? `${(denom * 100).toFixed(0)}¢` : denom.toFixed(denom >= 20 ? 0 : 0)}
        </span>
        <input
          type="text"
          inputMode="numeric"
          placeholder="0"
          className="flex-1 min-w-0 rounded-md bg-gray-900 border border-gray-700 px-2 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-fuchsia-500"
          value={cantidades[key] ?? ''}
          onChange={(e) => setQty(key, e.target.value)}
          disabled={enviando}
        />
        <span className="w-20 text-right text-xs font-mono text-gray-400">
          {subtotal > 0 ? `$${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Billetes */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-fuchsia-200">
          <Banknote className="h-4 w-4" />
          Billetes
        </div>
        <div className="space-y-1.5">
          {billetes.map((d, i) => renderInput(`b-${i}`, d))}
        </div>
      </div>

      {/* Monedas */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-200">
          <Coins className="h-4 w-4" />
          Monedas
        </div>
        <div className="space-y-1.5">
          {monedas.map((d, i) => renderInput(`m-${i}`, d))}
        </div>
      </div>

      {/* Transferencias */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-blue-200 block">
          Total cobrado por transferencia esta semana MK (sáb-vie)
        </label>
        <input
          type="text"
          inputMode="decimal"
          placeholder="$0.00"
          className="w-full rounded-md bg-gray-900 border border-gray-700 px-3 py-2 text-base text-white placeholder-gray-500 focus:outline-none focus:border-fuchsia-500"
          value={transferTxt}
          onChange={(e) => setTransferTxt(e.target.value)}
          disabled={enviando}
        />
        <p className="text-[11px] text-blue-200/70">
          Captura el monto de memoria o de tus apuntes. Es la cantidad total
          que el cliente te ha pagado por transferencia bancaria durante la
          semana en curso (sábado 00:00 al viernes 23:59).
        </p>
      </div>

      {/* Totales */}
      <div className="rounded-lg border-2 border-fuchsia-500/40 bg-fuchsia-500/5 p-3 space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-300">Efectivo contado</span>
          <span className="font-mono font-semibold text-white">
            ${totalEfectivo.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-300">Transferencias declaradas</span>
          <span className="font-mono font-semibold text-white">
            ${transferNum.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="flex items-center justify-between text-base pt-2 border-t border-fuchsia-500/30">
          <span className="font-semibold text-fuchsia-200">Total declarado</span>
          <span className="font-mono font-bold text-fuchsia-100">
            ${totalCombinado.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {!confirmado ? (
        <Button
          className="w-full"
          disabled={enviando || totalCombinado === 0}
          onClick={() => setConfirmado(true)}
        >
          Continuar
        </Button>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/40 rounded-md p-2 text-center">
            ⚠️ Confirma que lo contado y declarado es correcto. Una vez enviado NO podrás modificarlo.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmado(false)} disabled={enviando}>
              Revisar
            </Button>
            <Button className="flex-1" onClick={enviarCaptura} disabled={enviando}>
              {enviando ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</> : <><Send className="h-4 w-4" /> Enviar captura</>}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
