import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { calcLoan } from '@/lib/financial-formulas'
import { createAuditLog } from '@/lib/audit'
import { crearNotificacion, getDirectoresIds } from '@/lib/notifications'
import { z } from 'zod'

const forwardSchema = z.object({
  notas: z.string().optional(),
  // Mesa de Control puede reajustar el capital antes de enviarlo a DG.
  // Si viene, recalculamos todos los campos financieros del préstamo con la
  // misma fórmula del producto (misma lógica que la contrapropuesta del DG).
  capital: z.number().positive().optional(),
  // Solo INDIVIDUAL: porcentaje de comisión de apertura personalizado
  // (0 a 20). Sobrescribe la tasa automática por ciclo del cálculo.
  // Se ignora silenciosamente si el préstamo no es INDIVIDUAL.
  comisionPct: z.number().min(0).max(20).optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, id: userId } = session.user

  if (rol !== 'MESA_CONTROL' && rol !== 'SUPER_ADMIN') {
    return NextResponse.json(
      { error: 'Sin permisos — solo Mesa de Control puede enviar solicitudes a aprobación' },
      { status: 403 }
    )
  }

  const loan = await prisma.loan.findFirst({
    where: { id: params.id, companyId: companyId! },
  })
  if (!loan) return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })
  if (loan.estado !== 'PENDING_REVIEW') {
    return NextResponse.json(
      { error: 'La solicitud no está en revisión — no puede enviarse a aprobación' },
      { status: 400 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const parsed = forwardSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const { notas, capital, comisionPct } = parsed.data
  const hayCambioCapital = !!capital && Number(capital) !== Number(loan.capital)
  const hayComisionOverride = comisionPct !== undefined && loan.tipo === 'INDIVIDUAL'

  let loanUpdates: Record<string, unknown> = {}
  if (hayCambioCapital || hayComisionOverride) {
    const capitalFinal = capital ?? Number(loan.capital)
    const calc = calcLoan(
      loan.tipo as 'SOLIDARIO' | 'INDIVIDUAL' | 'AGIL' | 'FIDUCIARIO',
      capitalFinal,
      {
        ciclo: loan.ciclo ?? 1,
        tuvoAtraso: loan.tuvoAtraso,
        clienteIrregular: loan.clienteIrregular,
        tipoGrupo: (loan.tipoGrupo ?? undefined) as 'REGULAR' | 'RESCATE' | undefined,
      }
    )
    // Override de comisión para INDIVIDUAL: sobreescribe la tasa automática
    // por ciclo. montoReal se mantiene como capital (calcIndividual devuelve
    // montoReal = capital; la comisión se cobra aparte al activar).
    const comisionFinal = hayComisionOverride
      ? Math.round(capitalFinal * (comisionPct! / 100) * 100) / 100
      : calc.comision

    loanUpdates = {
      capital: calc.capital,
      comision: comisionFinal,
      montoReal: calc.montoReal,
      tasaInteres: calc.tasaInteres,
      interes: calc.interes,
      totalPago: calc.totalPago,
      pagoSemanal: calc.pagoSemanal ?? null,
      pagoDiario: calc.pagoDiario ?? null,
      pagoQuincenal: calc.pagoQuincenal ?? null,
      plazo: calc.plazo,
    }
  }

  await prisma.loan.update({
    where: { id: loan.id },
    data: {
      estado: 'PENDING_APPROVAL',
      revisadoPorId: userId,
      revisadoAt: new Date(),
      revisionNotasGenerales: notas ?? null,
      ...loanUpdates,
    },
  })

  createAuditLog({
    userId,
    accion: 'MESA_CONTROL_FORWARD',
    tabla: 'Loan',
    registroId: loan.id,
    valoresNuevos: {
      estado: 'PENDING_APPROVAL',
      revisadoPorId: userId,
      ...(hayCambioCapital ? { capitalAjustado: capital } : {}),
      ...(hayComisionOverride ? { comisionPctAjustado: comisionPct } : {}),
    },
  })

  // Notificar a DG/DC que hay una solicitud lista para aprobar.
  try {
    const [clienteRow, directores] = await Promise.all([
      prisma.client.findUnique({ where: { id: loan.clientId }, select: { nombreCompleto: true } }),
      getDirectoresIds(prisma, companyId!),
    ])
    const clienteNombre = clienteRow?.nombreCompleto ?? 'cliente'
    await crearNotificacion(prisma, {
      companyId: companyId!,
      destinatariosIds: directores,
      tipo: 'SOLICITUD_REVISADA',
      nivel: 'IMPORTANTE',
      titulo: 'Solicitud lista para aprobación',
      mensaje: `${clienteNombre} — revisada por Mesa de Control, pendiente de aprobación.`,
      loanId: loan.id,
      clientId: loan.clientId,
    })
  } catch (e) {
    console.error('[forward-to-dg] notif failed:', e)
  }

  return NextResponse.json({ message: 'Solicitud enviada a Dirección General' })
}
