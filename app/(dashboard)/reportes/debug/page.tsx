export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, XCircle } from 'lucide-react'
import { weekRange } from '@/lib/reportes/dateRanges'
import {
  getCarteraSnapshot,
  getCobranzaSnapshot,
  getCobranzaEsperada,
  getMoraSnapshot,
  getColocacionSnapshot,
  getLiquidacionesSnapshot,
  getFiltrosOpciones,
} from '@/lib/reportes/queries'
import { prisma } from '@/lib/prisma'

/**
 * Página de diagnóstico — ejecuta cada query del módulo Reportes una por
 * una atrapando errores localmente. Esto evita que Next.js redacte el
 * mensaje (lo cual hace cuando el error sale del Server Component sin
 * ser atrapado).
 *
 * Visible solo para DG/DC/SUPER_ADMIN. Cuando el módulo esté estable,
 * esta página se puede eliminar.
 */
export default async function ReportesDebugPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  const { rol, companyId } = session.user
  if (!['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'SUPER_ADMIN'].includes(rol)) {
    redirect('/reportes')
  }

  const accessUser = {
    id: session.user.id,
    rol,
    branchId: session.user.branchId,
    zonaBranchIds: session.user.zonaBranchIds,
  }

  const range = weekRange()

  type Probe = { name: string; ok: boolean; result?: unknown; error?: { message: string; stack?: string; name?: string } }

  async function run(name: string, fn: () => Promise<unknown>): Promise<Probe> {
    try {
      const result = await fn()
      return { name, ok: true, result: summarize(result) }
    } catch (e) {
      const err = e as Error
      return {
        name,
        ok: false,
        error: {
          message: err.message,
          stack: err.stack,
          name: err.name,
        },
      }
    }
  }

  function summarize(r: unknown): unknown {
    if (r == null) return r
    if (Array.isArray(r)) return `Array(${r.length})`
    if (typeof r === 'object') {
      const obj: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(r as object)) {
        if (Array.isArray(v)) obj[k] = `Array(${v.length})`
        else if (typeof v === 'object' && v !== null) obj[k] = '...'
        else obj[k] = v
      }
      return obj
    }
    return r
  }

  const probes: Probe[] = []

  probes.push(await run('session', async () => session.user))
  probes.push(await run('prisma.company.findUnique', () =>
    prisma.company.findUnique({ where: { id: companyId! }, select: { nombre: true } }),
  ))
  probes.push(await run('getFiltrosOpciones', () => getFiltrosOpciones(accessUser, companyId!)))
  probes.push(await run('getCarteraSnapshot', () => getCarteraSnapshot(accessUser, companyId!)))
  probes.push(await run('getCobranzaSnapshot', () => getCobranzaSnapshot(accessUser, companyId!, range)))
  probes.push(await run('getCobranzaEsperada', () => getCobranzaEsperada(accessUser, companyId!, range)))
  probes.push(await run('getMoraSnapshot', () => getMoraSnapshot(accessUser, companyId!)))
  probes.push(await run('getColocacionSnapshot', () => getColocacionSnapshot(accessUser, companyId!, range)))
  probes.push(await run('getLiquidacionesSnapshot', () => getLiquidacionesSnapshot(accessUser, companyId!, range)))

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Reportes — Debug</h1>
        <p className="text-muted-foreground text-sm">
          Cada query corre por separado para identificar cuál está rompiendo.
        </p>
      </div>

      <div className="space-y-3">
        {probes.map((p) => (
          <Card key={p.name} className={p.ok ? 'border-emerald-500/30' : 'border-rose-500/40'}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                {p.ok
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  : <XCircle className="h-4 w-4 text-rose-400" />}
                <span className="font-mono">{p.name}</span>
                <Badge variant={p.ok ? 'success' : 'destructive'} className="text-[10px]">
                  {p.ok ? 'OK' : 'FAIL'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {p.ok ? (
                <pre className="text-xs font-mono bg-secondary/40 rounded p-2 overflow-x-auto">
                  {JSON.stringify(p.result, null, 2)}
                </pre>
              ) : (
                <div className="space-y-2">
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Mensaje</span>
                    <p className="text-sm font-mono text-rose-300 mt-0.5 break-words">{p.error!.message}</p>
                  </div>
                  {p.error!.name && p.error!.name !== 'Error' && (
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Tipo</span>
                      <p className="text-xs font-mono mt-0.5">{p.error!.name}</p>
                    </div>
                  )}
                  {p.error!.stack && (
                    <details>
                      <summary className="cursor-pointer text-[10px] text-muted-foreground uppercase tracking-wide">
                        Stack trace
                      </summary>
                      <pre className="text-[10px] font-mono mt-2 whitespace-pre-wrap text-foreground/80 leading-relaxed">
                        {p.error!.stack}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
