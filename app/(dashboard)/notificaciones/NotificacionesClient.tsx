'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, Clock, Info, Loader2, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'

type Nivel = 'CRITICA' | 'IMPORTANTE' | 'INFORMATIVA'

interface Notif {
  id: string
  tipo: string
  titulo: string
  mensaje: string
  nivel: Nivel
  esCritica: boolean
  linkUrl: string | null
  leidaAt: string | null
  expiraAt: string | null
  createdAt: string
  loanId: string | null
  clientId: string | null
}

interface FetchResponse {
  items: Notif[]
  nextCursor: string | null
  noLeidasCount: number
  criticasCount: number
  importantesNoLeidas: number
}

type Filtro = 'todas' | 'no_leidas' | 'criticas' | 'importantes' | 'informativas'
type TipoFiltro = '' | 'LIMBO_'

const FILTROS: Array<{ value: Filtro; label: string }> = [
  { value: 'todas',        label: 'Todas' },
  { value: 'no_leidas',    label: 'No leídas' },
  { value: 'criticas',     label: 'Críticas' },
  { value: 'importantes',  label: 'Importantes' },
  { value: 'informativas', label: 'Informativas' },
]

const TIPOS: Array<{ value: TipoFiltro; label: string }> = [
  { value: '',       label: 'Todos los tipos' },
  { value: 'LIMBO_', label: 'Préstamos en limbo' },
]

const NIVEL_BADGE: Record<Nivel, { label: string; cls: string }> = {
  CRITICA:     { label: 'CRÍTICA',     cls: 'bg-red-500/20 text-red-600 dark:text-red-400 font-bold' },
  IMPORTANTE:  { label: 'IMPORTANTE',  cls: 'bg-amber-500/20 text-amber-700 dark:text-amber-400 font-semibold' },
  INFORMATIVA: { label: 'INFO',        cls: 'bg-muted text-muted-foreground' },
}

function fechaCompleta(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function destinoNotif(n: Notif): string | null {
  if (n.linkUrl) return n.linkUrl
  if (n.loanId) return `/prestamos/${n.loanId}`
  return null
}

export function NotificacionesClient() {
  const router = useRouter()
  const { toast } = useToast()
  const [items, setItems] = useState<Notif[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [marking, setMarking] = useState(false)
  const [noLeidasCount, setNoLeidasCount] = useState(0)
  const [criticasCount, setCriticasCount] = useState(0)
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>('')

  async function load(cursor: string | null = null, replace = true) {
    if (replace) setLoading(true)
    else setLoadingMore(true)
    try {
      const params = new URLSearchParams()
      params.set('limit', '30')
      if (cursor) params.set('cursor', cursor)
      if (filtro !== 'todas') params.set('filtro', filtro)
      if (tipoFiltro) params.set('tipo', tipoFiltro)

      const res = await fetch(`/api/notifications?${params}`)
      if (!res.ok) throw new Error('Error de carga')
      const data = (await res.json()) as FetchResponse
      setItems((prev) => (replace ? data.items : [...prev, ...data.items]))
      setNextCursor(data.nextCursor)
      setNoLeidasCount(data.noLeidasCount)
      setCriticasCount(data.criticasCount)
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    load(null, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro, tipoFiltro])

  async function handleClick(n: Notif) {
    const destino = destinoNotif(n)
    if (n.nivel !== 'CRITICA' && n.leidaAt === null) {
      try {
        await fetch(`/api/notifications/${n.id}/read`, { method: 'POST' })
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, leidaAt: new Date().toISOString() } : x)))
        setNoLeidasCount((c) => Math.max(0, c - 1))
      } catch {
        // ignore
      }
    }
    if (destino) router.push(destino)
  }

  async function marcarTodasLeidas() {
    setMarking(true)
    try {
      const res = await fetch('/api/notifications/mark-all-read', { method: 'POST' })
      const data = await res.json()
      toast({ title: `${data.count ?? 0} notificaciones marcadas como leídas` })
      await load(null, true)
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
    } finally {
      setMarking(false)
    }
  }

  // Solo se pueden marcar como leídas las no-leídas que no son críticas.
  const noLeidasMarcables = noLeidasCount - criticasCount

  return (
    <div className="space-y-4">
      {/* Toolbar de filtros y acciones */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Filter className="h-3.5 w-3.5" /> Filtros:
          </div>
          <div className="flex gap-1 flex-wrap">
            {FILTROS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFiltro(f.value)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                  filtro === f.value
                    ? 'bg-primary-500 text-white border-primary-500'
                    : 'bg-card text-muted-foreground border-border hover:bg-accent'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <select
            value={tipoFiltro}
            onChange={(e) => setTipoFiltro(e.target.value as TipoFiltro)}
            className="text-xs px-2 py-1 rounded-md bg-card border border-border"
          >
            {TIPOS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={marcarTodasLeidas}
          disabled={marking || noLeidasMarcables <= 0}
        >
          {marking && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
          Marcar todas como leídas
        </Button>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border border-dashed rounded-xl">
          Sin notificaciones
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden divide-y divide-border bg-card">
          {items.map((n) => {
            const isUnread = n.leidaAt === null
            const esCritica = n.nivel === 'CRITICA'
            const esImportante = n.nivel === 'IMPORTANTE'
            const rowBg = esCritica
              ? 'bg-red-50/40 dark:bg-red-500/10'
              : isUnread && esImportante
                ? 'bg-amber-50/30 dark:bg-amber-500/5'
                : isUnread
                  ? 'bg-muted/20'
                  : ''
            const badge = NIVEL_BADGE[n.nivel]
            return (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors flex gap-3 ${rowBg}`}
              >
                <div className="shrink-0 mt-1">
                  {esCritica ? (
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                  ) : esImportante ? (
                    <Clock className={`h-5 w-5 ${isUnread ? 'text-amber-500' : 'text-amber-300/40'}`} />
                  ) : isUnread ? (
                    <Info className="h-5 w-5 text-gray-400" />
                  ) : (
                    <Check className="h-5 w-5 text-muted-foreground/50" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-sm font-semibold ${esCritica ? 'text-red-600 dark:text-red-400' : isUnread ? '' : 'text-foreground/70'}`}>
                      {n.titulo}
                    </p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{n.tipo}</span>
                  </div>
                  <p className="text-sm text-foreground/85 mt-1">{n.mensaje}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{fechaCompleta(n.createdAt)}</p>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Cargar más */}
      {nextCursor && (
        <div className="flex justify-center py-2">
          <Button
            variant="outline"
            size="sm"
            disabled={loadingMore}
            onClick={() => load(nextCursor, false)}
          >
            {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
            Cargar más
          </Button>
        </div>
      )}
    </div>
  )
}
