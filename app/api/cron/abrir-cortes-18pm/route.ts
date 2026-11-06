import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  ROLES_HACEN_CORTE,
  snapshotParcialSemanalIncremental,
  siguienteNumeroCorte,
} from '@/lib/cortes'
import { inicioSemanaMk } from '@/lib/timezone'
import { todayMx, parseMxYMD, esViernesMk } from '@/lib/timezone'
import { purgeDeletedTask } from '@/lib/cron-tasks'

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
  // Autenticación opcional por Bearer token — permite que un servicio
  // externo (cron-job.org, EasyCron, UptimeRobot) dispare el endpoint
  // sin sesión. Útil como respaldo cuando Vercel Hobby salta el cron
  // nativo sin aviso. Requiere env var CRON_SECRET.
  const auth = req.headers.get('authorization')
  const esTokenValido = !!process.env.CRON_SECRET
    && auth === `Bearer ${process.env.CRON_SECRET}`

  let fecha = todayMx()
  if (fechaParam) {
    // Backfill manual — solo permitido fuera de la invocación del cron
    // (que siempre usa hoy). Validamos formato YYYY-MM-DD.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaParam)) {
      return NextResponse.json({ error: 'fecha debe ser YYYY-MM-DD' }, { status: 400 })
    }
    if (!esCron && !esTokenValido) {
      // Autenticación por sesión para que no cualquiera pueda disparar.
      const { getSession } = await import('@/lib/session')
      const session = await getSession()
      const rol = session?.user?.rol
      if (!session?.user || !['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'SUPER_ADMIN'].includes(rol ?? '')) {
        return NextResponse.json({ error: 'Solo DG/DC/SA pueden backfillear' }, { status: 403 })
      }
    }
    fecha = parseMxYMD(fechaParam)
  } else if (!esCron && !esTokenValido) {
    // Invocación sin fecha, sin ser cron de Vercel ni token válido: cae
    // a sesión. Antes era implícito (cualquiera podía invocar sin fecha
    // porque el único check de auth estaba dentro del branch fechaParam).
    const { getSession } = await import('@/lib/session')
    const session = await getSession()
    const rol = session?.user?.rol
    if (!session?.user || !['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'SUPER_ADMIN'].includes(rol ?? '')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
  }

  const dia = fecha.toISOString().slice(0, 10)
  let abiertos = 0
  let saltados = 0
  const errores: string[] = []

  // Modelo semanal MK: los parciales se entregan solo los VIERNES al
  // final de la semana (sáb→vie). Antes este cron corría todos los
  // días a las 18:00 CDMX creando un parcial diario por coord con
  // cobros del día — eso contradice el modelo semanal: dejaba cobros
  // de lun-jue atrapados en parciales diarios que nunca se entregaban.
  // Ahora solo opera los viernes (o cuando se pasa ?fecha= explícita
  // para backfillear un viernes específico).
  if (!esViernesMk(fecha)) {
    return NextResponse.json({
      dia,
      skipped: true,
      razon:   'Modelo semanal MK: los parciales solo se abren los viernes.',
      candidatos: 0,
      abiertos: 0,
      saltados: 0,
      errores: [],
    })
  }

  // Candidatos: user activo que haya cobrado algo en CUALQUIER día de
  // la semana MK (sáb→vie). Antes se buscaba solo por el día actual,
  // pero el parcial del viernes debe rescatar también lo cobrado
  // lun-jue si el coord nunca abrió un parcial manual.
  const semanaDesde = inicioSemanaMk(fecha)
  const candidatos = await prisma.user.findMany({
    where: {
      activo: true,
      rol:    { in: [...ROLES_HACEN_CORTE] },
      cashRegisters: {
        some: {
          fecha: { gte: semanaDesde, lte: fecha },
          OR: [
            { cobradoEfectivo:      { gt: 0 } },
            { cobradoTarjeta:       { gt: 0 } },
            { cobradoTransferencia: { gt: 0 } },
          ],
        },
      },
    },
    select: { id: true, companyId: true, branchId: true, nombre: true },
  })

  const ahora = new Date()
  // Pre-cargamos la relación "¿cada branch tiene concentrador asignado?"
  // para no consultar la DB por cada candidato.
  const branchesConcentrador = await prisma.branch.findMany({
    where:  { concentradorUserId: { not: null } },
    select: { id: true, concentradorUserId: true },
  })
  const concentradorPorBranch = new Map(
    branchesConcentrador.map((b) => [b.id, b.concentradorUserId!]),
  )

  for (const u of candidatos) {
    if (!u.branchId || !u.companyId) {
      saltados++
      continue
    }
    // Si el user ES el concentrador local de su sucursal, NO le abrimos
    // parcial — su efectivo propio semanal se acumula en
    // efectivoPropioResiduoSemana y se entrega junto con el consolidado
    // los viernes. Si le abriéramos un parcial diario, lo obligaríamos
    // a entregarlo como coord normal, duplicando el flujo de corte.
    if (concentradorPorBranch.get(u.branchId) === u.id) {
      saltados++
      continue
    }
    try {
      // Snapshot semanal incremental: resta lo que ya metió en
      // parciales adelantados de esta misma semana (sáb→vie) y lo que
      // ya "recibió de otros" en parciales previos. Si no queda nada
      // por rescatar, saltamos — no crear parciales vacíos.
      const snap = await snapshotParcialSemanalIncremental(prisma, u.id, fecha)
      const totalAEntregar = snap.efectivo + snap.recibidoDeOtros
      if (totalAEntregar === 0 && snap.tarjeta === 0 && snap.transferencia === 0) {
        saltados++
        continue
      }
      const numeroCorte = await siguienteNumeroCorte(prisma, u.id, fecha, 'PARCIAL')
      await prisma.corte.create({
        data: {
          companyId: u.companyId,
          userId:    u.id,
          fecha,
          branchId:  u.branchId,
          tipo: 'PARCIAL',
          numeroCorte,
          totalEfectivoCobrado:      snap.efectivo,
          totalTarjetaCobrado:       snap.tarjeta,
          totalTransferenciaCobrado: snap.transferencia,
          totalRecibidoDeOtros:      snap.recibidoDeOtros,
          totalAEntregar,
          autoCreadoAt:              ahora,
        },
      })
      abiertos++
    } catch (e) {
      errores.push(`${u.nombre}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Encadenamos la purga de soft-deletes aquí porque Vercel Hobby limita
  // a 2 cron jobs y necesitamos los otros 2 slots para check-prestamos-limbo
  // (14:00 UTC) y este mismo (00:00 UTC = 18:00 CDMX). La purga puede
  // correr a cualquier hora, así que entra piggyback.
  let purge: Awaited<ReturnType<typeof purgeDeletedTask>> | { error: string } | null = null
  if (!fechaParam) {
    // Solo en invocación real del cron, no en backfill manual.
    try {
      purge = await purgeDeletedTask()
    } catch (e) {
      purge = { error: e instanceof Error ? e.message : String(e) }
    }
  }

  return NextResponse.json({
    dia,
    candidatos: candidatos.length,
    abiertos,
    saltados,
    errores,
    purge,
  })
}
