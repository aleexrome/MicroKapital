import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { calcLoan } from '@/lib/financial-formulas'
import { createAuditLog } from '@/lib/audit'

const buildSchema = (minIntegrantes: number) =>
  z.object({
    nombre: z.string().min(2, 'Nombre del grupo requerido').transform((s) => s.trim().toUpperCase()),
    clientIds: z.array(z.string().uuid()).min(minIntegrantes, 'Mínimo 4 integrantes').max(5, 'Máximo 5 integrantes'),
    capitales: z.array(z.number().positive()).min(minIntegrantes, 'Mínimo 4 capitales').max(5, 'Máximo 5 capitales'),
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

  // Si el nombre del grupo viene con un '*' al inicio, se aceptan grupos de
  // 1-5 integrantes (casos especiales autorizados por DG). El asterisco se
  // retira antes de validar y de guardar, así no aparece en BD ni en reportes.
  // Los mensajes de error mantienen el texto "Mínimo 4" para no delatar el
  // gatillo a quien lo encuentre por accidente.
  const rawNombre = typeof body?.nombre === 'string' ? body.nombre.trimStart() : ''
  const esEspecial = rawNombre.startsWith('*')
  if (esEspecial) {
    body.nombre = rawNombre.replace(/^\*+/, '').trimStart()
  }
  const minIntegrantes = esEspecial ? 1 : 4

  const parsed = buildSchema(minIntegrantes).safeParse(body)
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

  // ── Anti-duplicado: bloquear si ALGÚN integrante ya tiene una solicitud
  // abierta (misma regla que la ruta individual). Si un solo integrante
  // choca, se aborta todo el submit del grupo — sería confuso crear el
  // grupo con parte de los integrantes y dejar a otros afuera.
  const solicitudesAbiertas = await prisma.loan.findMany({
    where: {
      clientId: { in: data.clientIds },
      companyId: companyId!,
      estado: { in: ['PENDING_REVIEW', 'RETURNED_TO_COORDINATOR', 'PENDING_APPROVAL'] },
    },
    select: {
      id: true,
      tipo: true,
      estado: true,
      capital: true,
      clientId: true,
      client: { select: { nombreCompleto: true } },
    },
  })
  if (solicitudesAbiertas.length > 0) {
    return NextResponse.json(
      {
        error: 'SOLICITUD_DUPLICADA',
        message:
          `No se puede crear el grupo — ${solicitudesAbiertas.length === 1 ? 'una integrante ya tiene' : 'algunas integrantes ya tienen'} una solicitud en proceso: ` +
          solicitudesAbiertas
            .map((s) => `${s.client.nombreCompleto} (${s.tipo} $${Number(s.capital).toFixed(2)})`)
            .join(', ') +
          '. Espera a que se resuelvan antes de reenviar.',
        integrantesBloqueadas: solicitudesAbiertas.map((s) => ({
          clientId: s.clientId,
          clienteNombre: s.client.nombreCompleto,
          loanId: s.id,
          tipo: s.tipo,
          estado: s.estado,
          capital: Number(s.capital),
        })),
      },
      { status: 409 }
    )
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
        const calc = calcLoan('SOLIDARIO', data.capitales[idx], {
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
            estado: 'PENDING_REVIEW',
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
