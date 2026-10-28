import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { tienePrestamosEnLimbo72h } from '@/lib/limbo-status'

/**
 * GET /api/loan-groups/[groupId]/renew-info
 *
 * Devuelve el estado de elegibilidad de cada integrante del grupo
 * solidario para renovación anticipada. Lo usa el diálogo
 * "Renovar grupo" para pre-llenar los capitales y mostrar los pagos
 * pendientes de cada integrante con sus checkboxes.
 *
 * El filtro es por regla del tipo SOLIDARIO:
 *   - Loan.estado = ACTIVE
 *   - Loan sin renovación en curso
 *   - pagosRealizados >= 6 (umbral)
 *   - cobradora sin préstamos en limbo > 72h (anti-fraude)
 *
 * Si al menos un integrante no es elegible, el UI bloquea el envío
 * (regla "todas o ninguna" que pidió Dirección).
 */

const UMBRAL_SOLIDARIO = 6

export async function GET(
  _req: NextRequest,
  { params }: { params: { groupId: string } },
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const rolesPermitidos = ['COORDINADOR', 'COBRADOR', 'GERENTE_ZONAL', 'GERENTE', 'MESA_CONTROL', 'SUPER_ADMIN', 'DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL']
  if (!rolesPermitidos.includes(session.user.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const group = await prisma.loanGroup.findFirst({
    where: { id: params.groupId, branch: { companyId: session.user.companyId! } },
    select: {
      id:    true,
      nombre: true,
      loans: {
        where:  { estado: 'ACTIVE', tipo: 'SOLIDARIO' },
        select: {
          id:       true,
          capital:  true,
          cobradorId: true,
          client:   { select: { id: true, nombreCompleto: true } },
          schedule: {
            select: {
              id:            true,
              numeroPago:    true,
              montoEsperado: true,
              estado:        true,
            },
            orderBy: { numeroPago: 'asc' },
          },
        },
      },
    },
  })

  if (!group) return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 })
  if (group.loans.length === 0) {
    return NextResponse.json({ error: 'El grupo no tiene créditos activos' }, { status: 400 })
  }

  // Chequear limbo >72h de los cobradores involucrados — en solidario
  // normalmente es la misma, pero por si acaso evaluamos todos los que
  // aparecen distintos.
  const cobradoresDistintos = Array.from(new Set(group.loans.map((l) => l.cobradorId)))
  const limboMap = new Map<string, { bloqueado: boolean; count: number }>()
  for (const cid of cobradoresDistintos) {
    const l = await tienePrestamosEnLimbo72h(cid, prisma)
    limboMap.set(cid, { bloqueado: l.bloqueado, count: l.prestamosEnLimbo?.length ?? 0 })
  }

  // Para cada loan, verificar si tiene renovación en curso
  const loansConRenovacionAbierta = new Set(
    (await prisma.loan.findMany({
      where: {
        loanOriginalId: { in: group.loans.map((l) => l.id) },
        estado:         { in: ['PENDING_REVIEW', 'RETURNED_TO_COORDINATOR', 'PENDING_APPROVAL', 'APPROVED', 'IN_ACTIVATION'] },
      },
      select: { loanOriginalId: true },
    })).map((r) => r.loanOriginalId as string),
  )

  const integrantes = group.loans.map((loan) => {
    const pagados = loan.schedule.filter((s) => s.estado === 'PAID').length
    const pagosPendientes = loan.schedule
      .filter((s) => s.estado === 'PENDING' || s.estado === 'OVERDUE' || s.estado === 'PARTIAL')
      .map((s) => ({
        id:            s.id,
        numeroPago:    s.numeroPago,
        montoEsperado: Number(s.montoEsperado),
      }))

    const limbo = limboMap.get(loan.cobradorId)
    const yaTieneRenovacion = loansConRenovacionAbierta.has(loan.id)

    let elegible = true
    let razonBloqueo: string | null = null
    if (yaTieneRenovacion) {
      elegible = false
      razonBloqueo = 'Ya tiene una renovación en proceso'
    } else if (pagados < UMBRAL_SOLIDARIO) {
      elegible = false
      razonBloqueo = `Faltan pagos para elegibilidad (${pagados}/${UMBRAL_SOLIDARIO})`
    } else if (limbo?.bloqueado) {
      elegible = false
      razonBloqueo = `Cobradora con ${limbo.count} préstamo(s) en limbo >72h`
    }

    return {
      loanId:        loan.id,
      clientId:      loan.client.id,
      clientNombre:  loan.client.nombreCompleto,
      capitalAnterior: Number(loan.capital),
      pagosRealizados: pagados,
      umbral:          UMBRAL_SOLIDARIO,
      pagosPendientes,
      elegible,
      razonBloqueo,
    }
  })

  const todosElegibles = integrantes.every((i) => i.elegible)

  return NextResponse.json({
    groupId:       group.id,
    groupNombre:   group.nombre,
    integrantes,
    todosElegibles,
  })
}
