import { NextRequest, NextResponse } from 'next/server'
import { purgeDeletedTask } from '@/lib/cron-tasks'

/**
 * GET /api/cron/purge-deleted
 *
 * Endpoint HTTP de la tarea de purga (soft-deletes ≥14 días sin
 * dependencias). La lógica vive en lib/cron-tasks.ts para poder
 * encadenarse desde /api/cron/abrir-cortes-18pm (que también la
 * ejecuta) y así esquivar el límite de 2 cron jobs del Hobby plan.
 *
 * Esta ruta se dejó para disparo manual (ej. tests, debug) protegida
 * con CRON_SECRET. Ya NO está en vercel.json — el cron real que la
 * invoca es `abrir-cortes-18pm`.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await purgeDeletedTask()
  return NextResponse.json(result)
}
