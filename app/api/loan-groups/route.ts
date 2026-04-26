import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { calcLoan } from '@/lib/financial-formulas'
import { createAuditLog } from '@/lib/audit'

const schema = z.object({
  nombre: z.string().min(2, 'Nombre del grupo requerido').transform((s) => s.trim().toUpperCase()),
  clientIds: z.array(z.string().uuid()).min(4, 'Mínimo 4 integrantes').max(5, 'Máximo 5 integrantes'),
  capitales: z.array(z.number().positive()).min(4, 'Mínimo 4 capitales').max(5, 'Máximo 5 capitales'),
  tipoGrupo: z.enum(['REGULAR', 'RESCATE']).default('REGULAR'),
  notas: z.string().optional(),
}).refine((d) => d.clientIds.length === d.capitales.length, {
  message: 'El número de capitales debe coincidir con el número de integrantes',
  path: ['capitales'],
})

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { companyId, branchId, id: userId, rol } = session.user

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const data = parsed.data

  // Verificar que todos los clientes pertenecen a la empresa
  const clients = await prisma.client.findMany({
    where: { id: { in: data.clientIds }, companyId: companyId! },
  })
  if (clients.length !== data.clientIds.length) {
    return NextResponse.json({ error: 'Uno o más clientes no encontrados en esta empresa' }, { status: 404 })
  }

  // Coordinador, Cobrador, Gerente y Gerente Zonal: se auto-asignan como cobrador
  // Solo Director puede crear grupos con cobrador explícito (requiere UI con selector)
  const isCampo = rol === 'COBRADOR' || rol === 'COORDINADOR' || rol === 'GERENTE_ZONAL' || rol === 'GERENTE'
  if (!isCampo) return NextResponse.json({ error: 'No autorizado para crear solicitudes de grupo solidario' }, { status: 403 })
  const cobradorId = userId

  const targetBranchId = branchId ?? session.user.zonaBranchIds?.[0] ?? clients[0].branchId
  if (!targetBranchId) return NextResponse.json({ error: 'Sucursal requerida' }, { status: 400 })

  const result = await prisma.$transaction(async (tx) => {
    // 1. Crear el grupo solidario
    const group = await tx.loanGroup.create({
      data: {
        branchId: targetBranchId,
        cobradorId,
        nombre: data.nombre,
        activo: true,
      },
    })

    // 2. Crear préstamo individual por cada integrante (capital individual por miembro)
    const loans = await Promise.all(
      data.clientIds.map(async (clientId, idx) => {
        const calc = calcLoan('SOLIDARIO', data.capitales[idx], undefined, {
          tipoGrupo: data.tipoGrupo,
        })
        const loan = await tx.loan.create({
          data: {
            companyId: companyId!,
            branchId: targetBranchId,
            cobradorId,
            clientId,
            loanGroupId: group.id,
            tipo: 'SOLIDARIO',
            estado: 'PENDING_APPROVAL',
            capital: calc.capital,
            comision: calc.comision,
            montoReal: calc.montoReal,
            tasaInteres: calc.tasaInteres,
            interes: calc.interes,
            totalPago: calc.totalPago,
            pagoSemanal: calc.pagoSemanal ?? null,
            pagoDiario: null,
            pagoQuincenal: null,
            plazo: calc.plazo,
            tipoGrupo: data.tipoGrupo,
            notas: data.notas ?? null,
          },
        })

        await tx.loanApproval.create({
          data: { loanId: loan.id, solicitadoPorId: userId, estado: 'PENDING' },
        })

        return loan
      })
    )

    return { group, loans }
  })

  createAuditLog({
    userId,
    accion: 'CREATE_LOAN_GROUP',
    tabla: 'LoanGroup',
    registroId: result.group.id,
    valoresNuevos: { nombre: data.nombre, integrantes: data.clientIds.length, capitales: data.capitales },
  })

  return NextResponse.json({ data: result }, { status: 201 })
}
