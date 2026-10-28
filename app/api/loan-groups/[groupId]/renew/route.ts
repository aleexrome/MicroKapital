import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { calcLoan } from '@/lib/financial-formulas'
import { createAuditLog } from '@/lib/audit'
import { tienePrestamosEnLimbo72h } from '@/lib/limbo-status'
import { crearNotificacion, getDirectoresIds, getGerentesZonalesIds, getMesaControlIds } from '@/lib/notifications'

/**
 * POST /api/loan-groups/[groupId]/renew
 *
 * Renueva anticipadamente TODOS los integrantes de un grupo solidario
 * en una sola operación. Regla: todas o ninguna. Si alguna renovación
 * individual falla la validación, nada se crea (transacción).
 *
 * Body:
 *   {
 *     notas?:  string, // notas comunes al grupo
 *     items: [{ loanId, capital, pagosFinanciadosIds }]
 *   }
 *
 * Mismo flujo que /api/loans/[id]/renew pero batcheado y con el
 * mismo check de limbo >72h aplicado al grupo entero.
 */
const UMBRAL_SOLIDARIO = 6

const schema = z.object({
  notas: z.string().optional(),
  items: z.array(z.object({
    loanId:              z.string().uuid(),
    capital:             z.number().positive(),
    pagosFinanciadosIds: z.array(z.string()).optional(),
  })).min(1),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { groupId: string } },
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, id: userId } = session.user
  const rolesPermitidos = ['COORDINADOR', 'COBRADOR', 'GERENTE_ZONAL', 'GERENTE', 'SUPER_ADMIN']
  if (!rolesPermitidos.includes(rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 })
  }

  const group = await prisma.loanGroup.findFirst({
    where: { id: params.groupId, branch: { companyId: companyId! } },
    select: { id: true, nombre: true, branchId: true },
  })
  if (!group) return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 })

  // Cargar todos los loans involucrados con su calendario y aval.
  const loans = await prisma.loan.findMany({
    where: {
      id:         { in: parsed.data.items.map((i) => i.loanId) },
      loanGroupId: group.id,
      companyId:  companyId!,
      estado:     'ACTIVE',
      tipo:       'SOLIDARIO',
    },
    include: {
      schedule: { orderBy: { numeroPago: 'asc' } },
      client:   { select: { id: true, nombreCompleto: true } },
    },
  })
  if (loans.length !== parsed.data.items.length) {
    return NextResponse.json({ error: 'Alguno de los créditos del grupo no está activo o no pertenece al grupo' }, { status: 400 })
  }

  // Chequeo de limbo >72h (si alguna cobradora involucrada está bloqueada → bloqueo total)
  const cobradoresDistintos = Array.from(new Set(loans.map((l) => l.cobradorId)))
  for (const cid of cobradoresDistintos) {
    const limbo = await tienePrestamosEnLimbo72h(cid, prisma)
    if (limbo.bloqueado) {
      return NextResponse.json({
        error: 'BLOQUEADO_POR_LIMBO',
        message: 'Hay préstamos en limbo >72h asignados al cobrador del grupo. Resuélvelos antes de renovar.',
      }, { status: 403 })
    }
  }

  // Validación de elegibilidad y validez de pagosFinanciadosIds por cada loan.
  const branchConfigPromise = prisma.branchContractConfig.findUnique({
    where: { branchId: group.branchId },
    select: { comisionRenovacionFija: true },
  })
  const renovacionesAbiertas = await prisma.loan.findMany({
    where: {
      loanOriginalId: { in: loans.map((l) => l.id) },
      estado:         { in: ['PENDING_REVIEW', 'RETURNED_TO_COORDINATOR', 'PENDING_APPROVAL', 'APPROVED', 'IN_ACTIVATION'] },
    },
    select: { loanOriginalId: true, client: { select: { nombreCompleto: true } } },
  })
  if (renovacionesAbiertas.length > 0) {
    return NextResponse.json({
      error: `Ya hay renovación en curso para: ${renovacionesAbiertas.map((r) => r.client.nombreCompleto).join(', ')}`,
    }, { status: 400 })
  }

  const branchConfig = await branchConfigPromise

  type Preparado = {
    original:            typeof loans[number]
    capitalNuevo:        number
    pagosFinanciadosIds: string[]
    montoFinanciado:     number
  }
  const preparados: Preparado[] = []
  for (const item of parsed.data.items) {
    const orig = loans.find((l) => l.id === item.loanId)!
    const pagados = orig.schedule.filter((s) => s.estado === 'PAID').length
    if (pagados < UMBRAL_SOLIDARIO) {
      return NextResponse.json({
        error: `${orig.client.nombreCompleto}: faltan pagos para elegibilidad (${pagados}/${UMBRAL_SOLIDARIO})`,
      }, { status: 400 })
    }
    const pendientesIds = new Set(orig.schedule
      .filter((s) => s.estado === 'PENDING' || s.estado === 'OVERDUE' || s.estado === 'PARTIAL')
      .map((s) => s.id))
    const selIds = item.pagosFinanciadosIds ?? []
    const invalidos = selIds.filter((id) => !pendientesIds.has(id))
    if (invalidos.length > 0) {
      return NextResponse.json({
        error: `${orig.client.nombreCompleto}: alguno de los pagos a financiar no corresponde a su crédito`,
      }, { status: 400 })
    }
    const montoFinanciado = orig.schedule
      .filter((s) => selIds.includes(s.id))
      .reduce((sum, s) => sum + Number(s.montoEsperado), 0)

    preparados.push({
      original:            orig,
      capitalNuevo:        item.capital,
      pagosFinanciadosIds: selIds,
      montoFinanciado,
    })
  }

  // Transacción: crear todos los nuevos loans + aprobaciones. Si uno falla, rollback total.
  const resultado = await prisma.$transaction(async (tx) => {
    const creados: { loanId: string; clienteNombre: string }[] = []
    for (const p of preparados) {
      const calc = calcLoan('SOLIDARIO', p.capitalNuevo, {
        ciclo:            p.original.ciclo ?? 1,
        tuvoAtraso:       p.original.tuvoAtraso,
        clienteIrregular: p.original.clienteIrregular,
        tipoGrupo:        (p.original.tipoGrupo ?? undefined) as 'REGULAR' | 'RESCATE' | undefined,
        comisionRenovacionFija: branchConfig?.comisionRenovacionFija
          ? Number(branchConfig.comisionRenovacionFija)
          : null,
      })
      const montoRealAjustado = Math.max(0, calc.montoReal - p.montoFinanciado)

      const notasLoan = parsed.data.notas
        ?? `Renovación anticipada grupal (grupo ${group.nombre}) — financia ${p.pagosFinanciadosIds.length} pago${p.pagosFinanciadosIds.length !== 1 ? 's' : ''} del crédito anterior ($${p.montoFinanciado.toFixed(2)})`

      const nuevoLoan = await tx.loan.create({
        data: {
          companyId:         companyId!,
          branchId:          p.original.branchId,
          cobradorId:        p.original.cobradorId,
          clientId:          p.original.client.id,
          tipo:              'SOLIDARIO',
          estado:            'PENDING_REVIEW',
          capital:           calc.capital,
          comision:          calc.comision,
          montoReal:         montoRealAjustado,
          tasaInteres:       calc.tasaInteres,
          interes:           calc.interes,
          totalPago:         calc.totalPago,
          pagoSemanal:       calc.pagoSemanal ?? null,
          pagoDiario:        calc.pagoDiario ?? null,
          pagoQuincenal:     calc.pagoQuincenal ?? null,
          plazo:             calc.plazo,
          ciclo:             p.original.ciclo ?? 1,
          tuvoAtraso:        p.original.tuvoAtraso,
          clienteIrregular:  p.original.clienteIrregular,
          tipoGrupo:         p.original.tipoGrupo ?? null,
          loanGroupId:       group.id,
          diaCobro:          p.original.diaCobro ?? null,
          horaLimiteCobro:   p.original.horaLimiteCobro ?? null,
          avalNombre:        p.original.avalNombre,
          avalTelefono:      p.original.avalTelefono,
          avalRelacion:      p.original.avalRelacion,
          loanOriginalId:    p.original.id,
          descuentoRenovacion: p.montoFinanciado,
          pagosFinanciadosIds: p.pagosFinanciadosIds,
          notas:             notasLoan,
        },
      })

      await tx.loanApproval.create({
        data: {
          loanId:          nuevoLoan.id,
          solicitadoPorId: userId,
          estado:          'PENDING',
          notas:           `Renovación anticipada grupal (grupo ${group.nombre}). Financia $${p.montoFinanciado.toFixed(2)} (${p.pagosFinanciadosIds.length} pago${p.pagosFinanciadosIds.length !== 1 ? 's' : ''}).`,
        },
      })

      creados.push({ loanId: nuevoLoan.id, clienteNombre: p.original.client.nombreCompleto })
    }
    return creados
  })

  createAuditLog({
    userId,
    accion:        'REQUEST_RENEWAL_GROUP',
    tabla:         'LoanGroup',
    registroId:    group.id,
    valoresNuevos: {
      grupoNombre:    group.nombre,
      integrantes:    resultado.length,
      nuevosLoanIds:  resultado.map((r) => r.loanId),
    },
  })

  // Una sola notificación por el grupo entero.
  try {
    const [mesaControl, gerentes] = await Promise.all([
      getMesaControlIds(prisma, companyId!),
      getGerentesZonalesIds(prisma, companyId!, group.branchId),
    ])
    const destinatarios = mesaControl.length
      ? [...mesaControl, ...gerentes]
      : [...(await getDirectoresIds(prisma, companyId!)), ...gerentes]
    await crearNotificacion(prisma, {
      companyId:        companyId!,
      destinatariosIds: destinatarios,
      tipo:             'RENOVACION_NUEVA',
      nivel:            'IMPORTANTE',
      titulo:           `Renovación grupal pendiente de revisión`,
      mensaje:          `Grupo ${group.nombre} — ${resultado.length} integrante${resultado.length !== 1 ? 's' : ''}`,
      loanId:           resultado[0]?.loanId ?? null,
    })
  } catch (e) {
    console.error('[renew-group] notif failed:', e)
  }

  return NextResponse.json({
    message: `Renovación grupal creada — ${resultado.length} solicitud${resultado.length !== 1 ? 'es' : ''} en revisión por Mesa de Control`,
    data: { creados: resultado },
  }, { status: 201 })
}
