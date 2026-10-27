import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  ROLES_HACEN_CORTE,
  snapshotCashRegisterDelDia,
  totalRecibidoDeOtrosEnDia,
} from '@/lib/cortes'
import { todayMx, parseMxYMD } from '@/lib/timezone'

/**
 * GET /api/cron/abrir-cortes-18pm
 *
 * Cron de Vercel configurado en vercel.json para correr diariamente a
 * las 00:00 UTC (= 18:00 CDMX, UTC-6 fijo todo el año desde 2022).
 *
 * Recorre a todos los users que deben hacer corte y tienen cobros
 * registrados HOY, y crea un Corte ABIERTO si no existe. El bloqueo
 * del DashboardLayout detecta este corte y congela al user al siguiente
 * acceso.
 *
 * Idempotente: upsert por (userId, fecha). Si ya existe cualquier
 * estado, no toca nada.
 *
 * BACKFILL manual: acepta ?fecha=YYYY-MM-DD. Útil cuando el cron de
 * Vercel no corrió (p.ej. deploy tardío, Hobby plan limit, etc.) y
 * hay que crear los cortes retroactivos para que los users caigan a
 * pantalla congelada el siguiente día. Solo DG/DC/SA pueden pasar
 * fecha manual — se chequea con el header x-vercel-cron o la sesión.
 */
export async function GET(req: NextRequest) {
  const fechaParam = req.nextUrl.searchParams.get('fecha')
  const esCron = req.headers.get('x-vercel-cron') === '1'

  let fecha = todayMx()
  if (fechaParam) {
    // Backfill manual — solo permitido fuera de la invocación del cron
    // (que siempre usa hoy). Validamos formato YYYY-MM-DD.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaParam)) {
      return NextResponse.json({ error: 'fecha debe ser YYYY-MM-DD' }, { status: 400 })
    }
    if (!esCron) {
      // Autenticación por sesión para que no cualquiera pueda disparar.
      const { getSession } = await import('@/lib/session')
      const session = await getSession()
      const rol = session?.user?.rol
      if (!session?.user || !['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'SUPER_ADMIN'].includes(rol ?? '')) {
        return NextResponse.json({ error: 'Solo DG/DC/SA pueden backfillear' }, { status: 403 })
      }
    }
    fecha = parseMxYMD(fechaParam)
  }

  const dia = fecha.toISOString().slice(0, 10)
  let abiertos = 0
  let saltados = 0
  const errores: string[] = []

  // Candidatos: cada user activo con rol que hace corte Y con CashRegister
  // del día (= cobró algo). Si no cobró, no se le abre nada.
  const candidatos = await prisma.user.findMany({
    where: {
      activo: true,
      rol:    { in: [...ROLES_HACEN_CORTE] },
      cashRegisters: { some: { fecha } },
    },
    select: { id: true, companyId: true, branchId: true, nombre: true },
  })

  const ahora = new Date()
  for (const u of candidatos) {
    if (!u.branchId || !u.companyId) {
      saltados++
      continue
    }
    try {
      // Si el user ya tiene AL MENOS un parcial del día (manual o auto),
      // no abrimos otro — el cron solo cubre el caso de user con cobros
      // que nunca abrió un parcial manual.
      const existe = await prisma.corte.findFirst({
        where: { userId: u.id, fecha, tipo: 'PARCIAL' },
        select: { id: true },
      })
      if (existe) {
        saltados++
        continue
      }
      const snap     = await snapshotCashRegisterDelDia(prisma, u.id, fecha)
      const recibido = await totalRecibidoDeOtrosEnDia(prisma, u.id, fecha)
      await prisma.corte.create({
        data: {
          companyId: u.companyId,
          userId:    u.id,
          fecha,
          branchId:  u.branchId,
          tipo: 'PARCIAL',
          numeroCorte: 1,
          totalEfectivoCobrado:      snap.efectivo,
          totalTarjetaCobrado:       snap.tarjeta,
          totalTransferenciaCobrado: snap.transferencia,
          totalRecibidoDeOtros:      recibido,
          totalAEntregar:            snap.efectivo + recibido,
          autoCreadoAt:              ahora,
        },
      })
      abiertos++
    } catch (e) {
      errores.push(`${u.nombre}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({
    dia,
    candidatos: candidatos.length,
    abiertos,
    saltados,
    errores,
  })
}
