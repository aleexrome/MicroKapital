'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { X, Loader2, AlertTriangle } from 'lucide-react'

interface User {
  id:     string
  nombre: string
  rol:    string
  branch: { id: string; nombre: string } | null
}
interface Branch { id: string; nombre: string }

interface Props {
  tipo:        'INDIVIDUAL' | 'BRANCH' | 'GLOBAL'
  targetUser?: User
  branches:    Branch[]
  onClose:     () => void
  onLanzado:   () => void
}

/**
 * Modal de confirmación para lanzar un arqueo. Para INDIVIDUAL el user
 * target ya viene seleccionado. Para BRANCH pide elegir sucursal. Para
 * GLOBAL es un botón de confirmación directo con warning fuerte.
 */
export function LanzarArqueoDialog({ tipo, targetUser, branches, onClose, onLanzado }: Props) {
  const { toast } = useToast()
  const [branchId, setBranchId] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function lanzar() {
    if (tipo === 'BRANCH' && !branchId) {
      toast({ title: 'Selecciona una sucursal', variant: 'destructive' })
      return
    }
    setEnviando(true)
    try {
      const res = await fetch('/api/arqueos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo,
          targetUserId: tipo === 'INDIVIDUAL' ? targetUser?.id : null,
          branchId:     tipo === 'BRANCH'     ? branchId      : null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Error al lanzar')
      }
      const saltados = (data.saltados as { motivo: string }[] | undefined) ?? []
      toast({
        title: 'Arqueo lanzado',
        description: `${data.incluidos} usuario(s) notificado(s)${saltados.length > 0 ? ` — ${saltados.length} saltados por tener arqueo pendiente` : ''}.`,
      })
      onLanzado()
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Error',
        variant: 'destructive',
      })
    } finally {
      setEnviando(false)
    }
  }

  const titulo = tipo === 'INDIVIDUAL'
    ? `Arqueo a ${targetUser?.nombre}`
    : tipo === 'BRANCH'
      ? 'Arqueo por sucursal'
      : 'Arqueo global'

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">{titulo}</h2>
          <button onClick={onClose} disabled={enviando} className="p-1 rounded hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 flex gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              {tipo === 'INDIVIDUAL' && (
                <p><strong>{targetUser?.nombre}</strong> no podrá usar el sistema hasta capturar su efectivo + transferencias.</p>
              )}
              {tipo === 'BRANCH' && (
                <p>Todos los usuarios activos de la sucursal elegida (coord, gerente, mesa de control, etc.) serán bloqueados hasta capturar.</p>
              )}
              {tipo === 'GLOBAL' && (
                <p><strong>TODOS</strong> los usuarios activos de la empresa (menos DG/DC/DS) serán bloqueados hasta capturar.</p>
              )}
            </div>
          </div>

          {tipo === 'BRANCH' && (
            <div>
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider block mb-1">
                Sucursal
              </label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-fuchsia-500"
                disabled={enviando}
              >
                <option value="">Elegir sucursal...</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
              </select>
            </div>
          )}

          {tipo === 'INDIVIDUAL' && targetUser?.branch?.nombre && (
            <p className="text-sm text-gray-600">
              <span className="text-gray-500">Sucursal:</span> {targetUser.branch.nombre}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={enviando}>Cancelar</Button>
            <Button className="flex-1" onClick={lanzar} disabled={enviando}>
              {enviando ? <><Loader2 className="h-4 w-4 animate-spin" /> Lanzando...</> : 'Lanzar arqueo'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
