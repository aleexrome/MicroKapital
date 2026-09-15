import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { generarFechasHabiles, generarFechasHabilesDesde } from '@/lib/business-days'
import { createAuditLog } from '@/lib/audit'

/**
 * POST /api/admin/reajustar-agil-sep16 — one-shot correctivo.
 *
 * Contexto:
 *   Hasta 2026-09-15 la lista de festivos fijos tenía 16 de septiembre
 *   marcado como inhábil. En la práctica MicroKapital sí opera ese día,
 *   asi que los créditos Ágil generaron sus calendarios recorriendo el
 *   16-sep al siguiente día hábil (17-sep). Todo lo que va DESPUES del
 *   16-sep en la vida del calendario queda +1 día calendario, y el
 *   crédito termina 1 día hábil más tarde de lo que debía.
 *
 * Este endpoint reconstruye el calendario ideal (con 16-sep habil) y
 * actualiza solo los PaymentSchedule que:
 *   - Pertenecen a un crédito AGIL vivo (ACTIVE / APPROVED / IN_ACTIVATION).
 *   - No están cobrados (estado NO in PAID, ADVANCE, FINANCIADO).
 *   - Su fechaVencimiento actual difiere de la fecha ideal recalculada.
 *
 * Los schedules ya cobrados no se tocan — el dinero ya entró y no
 * queremos moverles la fecha histórica.
 *
 * Modo dry-run: query param ?dry=1 (default). Solo con ?dry=0 se
 * escribe a BD.
 *
 * Permisos: DIRECTOR_GENERAL o SUPER_ADMIN.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { rol, companyId, id: userId } = session.user
  if (rol !== 'DIRECTOR_GENERAL' && rol !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Solo Dirección General puede correr este ajuste' }, { status: 403 })
  }

  const dryRun = req.nextUrl.searchParams.get('dry') !== '0'

  // Traemos los créditos Ágil vivos con su calendario completo. El
  // filtro amplio (schedule con fecha >= 2026-09-16) evita revisar
  // créditos que ya se cerraron antes del 16-sep — no tienen nada
  // que arreglar.
  const loans = await prisma.loan.findMany({
    where: {
      companyId: companyId!,
      tipo: 'AGIL',
      estado: { in: ['ACTIVE', 'APPROVED', 'IN_ACTIVATION'] },
      schedule: {
        some: { fechaVencimiento: { gte: new Date('2026-09-16T00:00:00Z') } },
      },
    },
    select: {
      id: true,
      fechaDesembolso: true,
      fechaPrimerPago: true,
      plazo: true,
      schedule: {
        orderBy: { numeroPago: 'asc' },
        select: {
          id: true,
          numeroPago: true,
          fechaVencimiento: true,
          estado: true,
        },
      },
    },
  })

  interface ScheduleUpdate {
    scheduleId: string
    loanId: string
    numeroPago: number
    fechaAnterior: string
    fechaNueva: string
  }
  const updates: ScheduleUpdate[] = []
  const loansAfectados: Array<{ loanId: string; scheduleCount: number }> = []

  for (const loan of loans) {
    if (loan.schedule.length === 0) continue

    // Reconstruimos el calendario ideal con la lógica nueva (sin 16-sep
    // como festivo). Usamos el mismo pivote que usa el endpoint de
    // generar contrato: si hay fechaPrimerPago la anclamos ahi (P1 =
    // fechaPrimerPago); si no, arrancamos desde fechaDesembolso.
    const plazo = Number(loan.plazo)
    let idealFechas: Date[]
    if (loan.fechaPrimerPago) {
      idealFechas = generarFechasHabilesDesde(loan.fechaPrimerPago, plazo)
    } else if (loan.fechaDesembolso) {
      idealFechas = generarFechasHabiles(loan.fechaDesembolso, plazo)
    } else {
      continue
    }

    let ajustesEsteLoan = 0
    for (const s of loan.schedule) {
      // Ya cobrado o financiado → dejamos histórico intacto.
      if (s.estado === 'PAID' || s.estado === 'ADVANCE' || s.estado === 'FINANCIADO') continue

      const ideal = idealFechas[s.numeroPago - 1]
      if (!ideal) continue

      // Comparamos en UTC día calendario, no timestamp exacto (los
      // Date construidos difieren en hora si vienen de BD vs generador).
      const actual = new Date(s.fechaVencimiento)
      const misma = actual.getUTCFullYear() === ideal.getUTCFullYear()
        && actual.getUTCMonth() === ideal.getUTCMonth()
        && actual.getUTCDate() === ideal.getUTCDate()
      if (misma) continue

      updates.push({
        scheduleId: s.id,
        loanId: loan.id,
        numeroPago: s.numeroPago,
        fechaAnterior: actual.toISOString().slice(0, 10),
        fechaNueva: ideal.toISOString().slice(0, 10),
      })
      ajustesEsteLoan++
    }
    if (ajustesEsteLoan > 0) {
      loansAfectados.push({ loanId: loan.id, scheduleCount: ajustesEsteLoan })
    }
  }

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      loansAfectados: loansAfectados.length,
      schedulesAfectados: updates.length,
      preview: updates.slice(0, 50),
      note: 'Vuelve a llamar el endpoint con ?dry=0 para aplicar los cambios.',
    })
  }

  // Aplicar en transacción. Cada update es un update aislado; la
  // transacción da atomicidad si algo falla a mitad.
  const applied = await prisma.$transaction(
    updates.map((u) =>
      prisma.paymentSchedule.update({
        where: { id: u.scheduleId },
        data: { fechaVencimiento: new Date(u.fechaNueva + 'T06:00:00.000Z') },
      }),
    ),
  )

  createAuditLog({
    userId,
    accion: 'REAJUSTE_AGIL_SEP16',
    tabla: 'PaymentSchedule',
    registroId: '(varios)',
    valoresNuevos: {
      loansAfectados: loansAfectados.length,
      schedulesAfectados: applied.length,
      motivo: '16-sep dejó de ser inhábil — recalculo de calendarios Ágil vigentes',
    },
    ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
  })

  return NextResponse.json({
    dryRun: false,
    loansAfectados: loansAfectados.length,
    schedulesAfectados: applied.length,
  })
}
