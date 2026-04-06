import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { calcLoan } from '@/lib/financial-formulas'
import { generarFechasSemanales, generarFechasHabiles } from '@/lib/business-days'
import { createAuditLog } from '@/lib/audit'

const createLoanSchema = z.object({
  clientId: z.string().uuid(),
  tipo: z.enum(['SOLIDARIO', 'INDIVIDUAL', 'AGIL']),
  capital: z.number().positive(),
  tasaInteres: z.number().positive().optional(),
  cobradorId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  loanGroupId: z.string().uuid().optional(),
  notas: z.string().optional(),
})

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, branchId } = session.user

  let cobradorIdFilter: string | undefined
  if (rol === 'COBRADOR') {
    const cobrador = await prisma.user.findFirst({
      where: { companyId: companyId!, email: session.user.email! },
    })
    cobradorIdFilter = cobrador?.id
  }

  const estado = req.nextUrl.searchParams.get('estado')

  const loans = await prisma.loan.findMany({
    where: {
      companyId: companyId!,
      ...(cobradorIdFilter ? { cobradorId: cobradorIdFilter } : {}),
      ...(rol === 'COBRADOR' && branchId ? { branchId } : {}),
      ...(estado ? { estado: estado as 'PENDING_APPROVAL' | 'ACTIVE' | 'LIQUIDATED' | 'REJECTED' | 'RESTRUCTURED' | 'DEFAULTED' } : {}),
    },
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

  // Obtener tasa desde settings si no se envía
  let tasaInteres = data.tasaInteres
  if (!tasaInteres) {
    const settingKey = data.tipo === 'SOLIDARIO' ? 'tasa_solidario' : 'tasa_individual'
    const setting = await prisma.companySetting.findFirst({
      where: { companyId: companyId!, clave: settingKey },
    })
    tasaInteres = setting ? parseFloat(setting.valor) : (data.tipo === 'SOLIDARIO' ? 0.40 : 0.30)
  }

  const calc = calcLoan(data.tipo, data.capital, tasaInteres)

  // Verificar que el cliente pertenezca a la empresa
  const client = await prisma.client.findFirst({
    where: { id: data.clientId, companyId: companyId! },
  })
  if (!client) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  const targetBranchId = data.branchId ?? branchId ?? client.branchId
  if (!targetBranchId) return NextResponse.json({ error: 'Sucursal requerida' }, { status: 400 })

  let cobradorId = data.cobradorId
  if (rol === 'COBRADOR') {
    const cobrador = await prisma.user.findFirst({
      where: { companyId: companyId!, email: session.user.email! },
    })
    cobradorId = cobrador?.id
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
        plazo: calc.plazo,
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
