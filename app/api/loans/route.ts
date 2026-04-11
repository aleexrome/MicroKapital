import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { calcLoan } from '@/lib/financial-formulas'
import { generarFechasSemanales, generarFechasHabiles } from '@/lib/business-days'
import { createAuditLog } from '@/lib/audit'

const createLoanSchema = z.object({
  clientId: z.string().uuid(),
  tipo: z.enum(['SOLIDARIO', 'INDIVIDUAL', 'AGIL', 'FIDUCIARIO']),
  capital: z.number().positive(),
  tasaInteres: z.number().positive().optional(),
  cobradorId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  loanGroupId: z.string().uuid().optional(),
  notas: z.string().optional(),
  // Campos de comportamiento
  ciclo: z.number().int().min(1).optional(),
  tuvoAtraso: z.boolean().optional(),
  clienteIrregular: z.boolean().optional(),
  tipoGrupo: z.enum(['REGULAR', 'RESCATE']).optional(),
  // Campos FIDUCIARIO
  tipoGarantia: z.enum(['MUEBLE', 'INMUEBLE']).optional(),
  descripcionGarantia: z.string().optional(),
  valorGarantia: z.number().positive().optional(),
  // Aval (INDIVIDUAL y FIDUCIARIO)
  avalNombre: z.string().optional(),
  avalTelefono: z.string().optional(),
  avalRelacion: z.string().optional(),
})

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, branchId, id: userId } = session.user

  const estado = req.nextUrl.searchParams.get('estado')

  const where: Prisma.LoanWhereInput = {
    companyId: companyId!,
    ...(estado ? { estado: estado as 'PENDING_APPROVAL' | 'ACTIVE' | 'LIQUIDATED' | 'REJECTED' | 'RESTRUCTURED' | 'DEFAULTED' } : {}),
  }

  if (rol === 'COBRADOR' || rol === 'COORDINADOR') {
    where.cobradorId = userId
    if (branchId) where.branchId = branchId
  } else if (rol === 'GERENTE') {
    const branchIds = session.user.zonaBranchIds?.length
      ? session.user.zonaBranchIds
      : branchId ? [branchId] : null
    if (branchIds?.length) where.branchId = { in: branchIds }
  } else if (rol === 'GERENTE_ZONAL') {
    const zoneIds = session.user.zonaBranchIds
    if (zoneIds?.length) where.branchId = { in: zoneIds }
  } else if (rol === 'DIRECTOR_GENERAL' || rol === 'DIRECTOR_COMERCIAL') {
    if (branchId) where.branchId = branchId
  }

  const loans = await prisma.loan.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      client: { select: { nombreCompleto: true } },
      cobrador: { select: { nombre: true } },
    },
  })

  return NextResponse.json({ data: loans })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, branchId, id: userId } = session.user
  const body = await req.json()
  const parsed = createLoanSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const data = parsed.data

  // Para FIDUCIARIO la tasa la define la empresa; para los demás está fija en las fórmulas
  let tasaInteres = data.tasaInteres
  if (!tasaInteres && data.tipo === 'FIDUCIARIO') {
    const setting = await prisma.companySetting.findFirst({
      where: { companyId: companyId!, clave: 'tasa_fiduciario' },
    })
    tasaInteres = setting ? parseFloat(setting.valor) : 0.30
  }

  const calc = calcLoan(data.tipo, data.capital, tasaInteres, {
    ciclo: data.ciclo,
    tuvoAtraso: data.tuvoAtraso,
    clienteIrregular: data.clienteIrregular,
    tipoGrupo: data.tipoGrupo,
  })

  // Verificar que el cliente pertenezca a la empresa
  const client = await prisma.client.findFirst({
    where: { id: data.clientId, companyId: companyId! },
  })
  if (!client) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  const targetBranchId = data.branchId ?? branchId ?? session.user.zonaBranchIds?.[0] ?? client.branchId
  if (!targetBranchId) return NextResponse.json({ error: 'Sucursal requerida' }, { status: 400 })

  // Coordinador, Cobrador, Gerente y Gerente Zonal: se asignan a sí mismos como cobrador
  // Solo Director puede asignar a otro cobrador (envía cobradorId en el body)
  const isCampo = rol === 'COBRADOR' || rol === 'COORDINADOR' || rol === 'GERENTE_ZONAL' || rol === 'GERENTE'
  let cobradorId = data.cobradorId
  if (isCampo) {
    cobradorId = userId
  }
  if (!cobradorId) return NextResponse.json({ error: 'Cobrador requerido' }, { status: 400 })

  const loan = await prisma.$transaction(async (tx) => {
    const newLoan = await tx.loan.create({
      data: {
        companyId: companyId!,
        branchId: targetBranchId,
        cobradorId,
        clientId: data.clientId,
        loanGroupId: data.loanGroupId ?? null,
        tipo: data.tipo,
        estado: 'PENDING_APPROVAL',
        capital: calc.capital,
        comision: calc.comision,
        montoReal: calc.montoReal,
        tasaInteres: calc.tasaInteres,
        interes: calc.interes,
        totalPago: calc.totalPago,
        pagoSemanal: calc.pagoSemanal ?? null,
        pagoDiario: calc.pagoDiario ?? null,
        pagoQuincenal: calc.pagoQuincenal ?? null,
        plazo: calc.plazo,
        ciclo: data.ciclo ?? 1,
        tuvoAtraso: data.tuvoAtraso ?? false,
        clienteIrregular: data.clienteIrregular ?? false,
        tipoGrupo: data.tipoGrupo ?? null,
        tipoGarantia: data.tipoGarantia ?? null,
        descripcionGarantia: data.descripcionGarantia ?? null,
        valorGarantia: data.valorGarantia ?? null,
        avalNombre: data.avalNombre ?? null,
        avalTelefono: data.avalTelefono ?? null,
        avalRelacion: data.avalRelacion ?? null,
        notas: data.notas ?? null,
      },
    })

    // Crear solicitud de aprobación
    await tx.loanApproval.create({
      data: {
        loanId: newLoan.id,
        solicitadoPorId: userId,
        estado: 'PENDING',
      },
    })

    return newLoan
  })

  createAuditLog({
    userId,
    accion: 'CREATE_LOAN',
    tabla: 'Loan',
    registroId: loan.id,
    valoresNuevos: { tipo: data.tipo, capital: data.capital, clientId: data.clientId },
  })

  return NextResponse.json({ data: loan }, { status: 201 })
}
