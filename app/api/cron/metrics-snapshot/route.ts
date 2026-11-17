import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { escribirSnapshotCobranza } from '@/lib/reportes/tiempoReal'

/**
 * Cron para el dashboard /reportes/tiempo-real.
 *
 * Vercel Hobby limita crons a frecuencia DIARIA (una ejecución por
 * día). Con eso no basta para alimentar la gráfica horaria, así que
 * los snapshots también se generan on-demand desde `getCobranzaTiempoReal`
 * cada vez que alguien abre el dashboard y el último tiene >25 min.
 * Este cron queda como "seed" diario — garantiza al menos un punto
 * de arranque aunque nadie visite la página.
 *
 * Para que corra cada 30 min hay que subir a Vercel Pro y cambiar el
 * schedule en vercel.json a `*​/30 * * * *`.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companies = await prisma.company.findMany({
    where:  { activa: true },
    select: { id: true, nombre: true },
  })

  const resultados: Array<{ companyId: string; ok: boolean; error?: string }> = []
  for (const company of companies) {
    try {
      await escribirSnapshotCobranza(company.id)
      resultados.push({ companyId: company.id, ok: true })
    } catch (e) {
      resultados.push({ companyId: company.id, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }

  return NextResponse.json({ timestamp: new Date().toISOString(), resultados })
}
