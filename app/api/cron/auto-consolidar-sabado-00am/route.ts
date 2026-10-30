import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  parcialesParaConsolidar,
  siguienteNumeroCorte,
  efectivoPropioResiduoSemana,
} from '@/lib/cortes'
import { todayMx, esViernesMk, parseMxYMD } from '@/lib/timezone'
import { createAuditLog } from '@/lib/audit'

/**
 * GET /api/cron/auto-consolidar-sabado-00am
 *
 * Cron que corre a las 00:00 CDMX del sábado (= 06:00 UTC sábado).
 * Fallback automático: si una concentradora no activó su consolidado
 * del viernes, el sistema lo arma solo para que la cadena no se trabe
 * y Dirección tenga qué cobrarle el lunes.
 *
 * Para cada concentradora de la empresa:
 *   1. Si tiene efectivo propio de la semana sin consolidar, se le crea
 *      un parcial auto-aceptado residuo (mismo flujo que /iniciar).
 *   2. Agrupa todos sus parciales ACEPTADOS de la semana (sáb→vie) que
 *      todavía no estén en un consolidado.
 *   3. Crea un CONSOLIDADO ABIERTO con esos parciales. La concentradora
 *      lo verá al lunes y lo tendrá que entregar a DG/DC.
 *
 * Autenticación: x-vercel-cron, Authorization: Bearer CRON_SECRET, o
 * sesión DG/DC/SA (para backfill manual con ?fecha=YYYY-MM-DD, donde
 * fecha es el VIERNES que se auto-consolida).
 *
 * Idempotente: si una concentradora ya consolidó todos sus parciales,
 * `parcialesParaConsolidar` devuelve [] y la saltamos.
 */
export async function GET(req: NextRequest) {
  const esCron = req.headers.get('x-vercel-cron') === '1'
  const auth = req.headers.get('authorization')
  const esTokenValido = !!process.env.CRON_SECRET
    && auth === `Bearer ${process.env.CRON_SECRET}`

  const fechaParam = req.nextUrl.searchParams.get('fecha')
  if (fechaParam && !/^\d{4}-\d{2}-\d{2}$/.test(fechaParam)) {
    return NextResponse.json({ error: 'fecha debe ser YYYY-MM-DD' }, { status: 400 })
  }
  // Modo dry-run: valida autenticación + listas concentradoras + parciales
  // pendientes, SIN crear nada en DB. Útil para probar el cron en vivo
  // sin riesgo de armar consolidados prematuros.
  const dryRun = req.nextUrl.searchParams.get('dry-run') === '1'

  // Si no es Vercel ni Bearer, exigir sesión DG/DC/SA.
  if (!esCron && !esTokenValido) {
    const { getSession } = await import('@/lib/session')
    const session = await getSession()
    const rol = session?.user?.rol
    if (!session?.user || !['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'SUPER_ADMIN'].includes(rol ?? '')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
  }

  // Fecha de referencia del consolidado = el VIERNES que acabó. Si el
  // cron corre a las 00:00 sábado, hoy = sábado → ayer = viernes.
  // Si viene fechaParam (backfill manual), ese ES el viernes.
  const fechaViernes = fechaParam
    ? parseMxYMD(fechaParam)
    : new Date(todayMx().getTime() - 24 * 60 * 60 * 1000)

  if (!esViernesMk(fechaViernes)) {
    return NextResponse.json({
      error: 'La fecha de referencia debe ser un viernes CDMX',
      fecha: fechaViernes.toISOString().slice(0, 10),
    }, { status: 400 })
  }

  // Todas las concentradoras activas de la empresa — las que figuren
  // como Branch.concentradorUserId en sucursales activas.
  const branches = await prisma.branch.findMany({
    where:  { activa: true, concentradorUserId: { not: null } },
    select: {
      id:                 true,
      nombre:             true,
      companyId:          true,
      concentradorUserId: true,
      concentrador:       { select: { id: true, nombre: true, activo: true, companyId: true } },
    },
  })

  const resultados: Array<{
    concentradora:  string
    sucursal:       string
    parciales:      number
    consolidadoId?: string
    error?:         string
  }> = []
  let creados  = 0
  let saltados = 0

  for (const b of branches) {
    if (!b.concentrador?.activo) {
      saltados++
      continue
    }
    const userId    = b.concentrador.id
    const companyId = b.concentrador.companyId
    try {
      // En dry-run, saltamos la creación de residuo y solo listamos
      // cuántos parciales habría. Nada se escribe en DB.
      if (dryRun) {
        const parciales = await parcialesParaConsolidar(prisma, userId, fechaViernes)
        const residuo   = await efectivoPropioResiduoSemana(prisma, userId, fechaViernes)
        resultados.push({
          concentradora: b.concentrador.nombre,
          sucursal:      b.nombre,
          parciales:     parciales.length,
        })
        if (parciales.length > 0 || residuo.efectivo > 0 || residuo.tarjeta > 0 || residuo.transferencia > 0) {
          creados++
        } else {
          saltados++
        }
        continue
      }

      // 1. Residuo de efectivo propio de la semana → parcial auto-aceptado.
      const residuo = await efectivoPropioResiduoSemana(prisma, userId, fechaViernes)
      if (residuo.efectivo > 0 || residuo.tarjeta > 0 || residuo.transferencia > 0) {
        const totalResiduo = residuo.efectivo
        const numeroParcialAuto = await siguienteNumeroCorte(prisma, userId, fechaViernes, 'PARCIAL')
        await prisma.corte.create({
          data: {
            companyId,
            userId,
            fecha:                     fechaViernes,
            branchId:                  b.id,
            tipo:                      'PARCIAL',
            numeroCorte:               numeroParcialAuto,
            totalEfectivoCobrado:      residuo.efectivo,
            totalTarjetaCobrado:       residuo.tarjeta,
            totalTransferenciaCobrado: residuo.transferencia,
            totalRecibidoDeOtros:      0,
            totalAEntregar:            totalResiduo,
            estado:                    'ACEPTADO',
            receptorId:                userId,
            entregadoAt:               new Date(),
            aceptadoAt:                new Date(),
            montoAceptado:             totalResiduo,
            autoCreadoAt:              new Date(),
          },
        })
      }

      // 2. Agrupar parciales ACEPTADOS de la semana sin consolidar.
      const parciales = await parcialesParaConsolidar(prisma, userId, fechaViernes)
      if (parciales.length === 0) {
        saltados++
        continue
      }

      const totalAEntregar = parciales.reduce((s, p) => s + p.montoAceptado, 0)
      const numeroCorte = await siguienteNumeroCorte(prisma, userId, fechaViernes, 'CONSOLIDADO')

      // 3. Crear consolidado ABIERTO + ligar hijos (misma lógica que /iniciar).
      const consolidado = await prisma.$transaction(async (tx) => {
        const c = await tx.corte.create({
          data: {
            companyId,
            userId,
            fecha:                fechaViernes,
            branchId:             b.id,
            tipo:                 'CONSOLIDADO',
            numeroCorte,
            totalRecibidoDeOtros: totalAEntregar,
            totalAEntregar,
            estado:               'ABIERTO',
            autoCreadoAt:         new Date(),
          },
        })
        await tx.corte.updateMany({
          where: { id: { in: parciales.map((p) => p.id) } },
          data:  { consolidadoPadreId: c.id },
        })
        return c
      })

      createAuditLog({
        userId,
        accion:        'ABRIR_CONSOLIDADO_AUTO',
        tabla:         'Corte',
        registroId:    consolidado.id,
        valoresNuevos: {
          numeroCorte,
          tipo:               'CONSOLIDADO',
          totalAEntregar,
          parcialesIncluidos: parciales.map((p) => p.id),
          autoCreadoAt:       consolidado.autoCreadoAt?.toISOString(),
        },
      })

      resultados.push({
        concentradora: b.concentrador.nombre,
        sucursal:      b.nombre,
        parciales:     parciales.length,
        consolidadoId: consolidado.id,
      })
      creados++
    } catch (e) {
      resultados.push({
        concentradora: b.concentrador?.nombre ?? '—',
        sucursal:      b.nombre,
        parciales:     0,
        error:         e instanceof Error ? e.message : String(e),
      })
    }
  }

  return NextResponse.json({
    ...(dryRun ? { dryRun: true } : {}),
    fechaViernes: fechaViernes.toISOString().slice(0, 10),
    totalConcentradoras: branches.length,
    ...(dryRun ? { conPendientes: creados } : { creados }),
    saltados,
    resultados,
  })
}
