import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'

const ROLES_DEFINEN = ['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL'] as const

const goalSchema = z.object({
  semanaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  branchId: z.string().nullable().optional(),
  cobradorId: z.string().nullable().optional(),
  loanType: z.enum(['SOLIDARIO', 'INDIVIDUAL', 'AGIL', 'FIDUCIARIO']).nullable().optional(),
  metaCapitalColocado:    z.number().nonnegative().nullable().optional(),
  metaCreditosColocados:  z.number().int().nonnegative().nullable().optional(),
  metaCobranzaEsperada:   z.number().nonnegative().nullable().optional(),
  metaCobranzaEfectiva:   z.number().nonnegative().nullable().optional(),
  metaMoraMaxima:         z.number().min(0).max(100).nullable().optional(),
  metaCrecimiento:        z.number().nullable().optional(),
  notas: z.string().max(500).nullable().optional(),
})

/** Calcula domingo (semanaFin) a partir de semanaInicio (lunes ISO). */
function calcularSemanaFin(semanaInicioIso: string): Date {
  const [y, m, d] = semanaInicioIso.split('-').map(Number)
  const lunes = new Date(Date.UTC(y, m - 1, d))
  const domingo = new Date(lunes)
  domingo.setUTCDate(domingo.getUTCDate() + 6)
  return domingo
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { rol, companyId } = session.user

  // Lectura: DG, DC, GERENTE_ZONAL pueden ver. Coordinador/cobrador no.
  if (!['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'GERENTE_ZONAL'].includes(rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const url = new URL(req.url)
  const semanaInicio = url.searchParams.get('semanaInicio')

  const where: { companyId: string; semanaInicio?: Date } = { companyId: companyId! }
  if (semanaInicio) {
    const [y, m, d] = semanaInicio.split('-').map(Number)
    where.semanaInicio = new Date(Date.UTC(y, m - 1, d))
  }

  const goals = await prisma.goal.findMany({
    where,
    orderBy: [{ semanaInicio: 'desc' }, { branchId: 'asc' }, { cobradorId: 'asc' }],
  })

  return NextResponse.json({ goals })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { rol, companyId, id: userId } = session.user
  if (!ROLES_DEFINEN.includes(rol as typeof ROLES_DEFINEN[number])) {
    return NextResponse.json(
      { error: 'Solo Dirección General o Comercial pueden definir metas' },
      { status: 403 },
    )
  }

  const body = await req.json().catch(() => null)
  const parsed = goalSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.issues }, { status: 400 })
  }
  const data = parsed.data

  // Validar que branchId / cobradorId pertenezcan a la empresa
  if (data.branchId) {
    const b = await prisma.branch.findFirst({
      where: { id: data.branchId, companyId: companyId! },
      select: { id: true },
    })
    if (!b) return NextResponse.json({ error: 'Sucursal no válida' }, { status: 400 })
  }
  if (data.cobradorId) {
    const c = await prisma.user.findFirst({
      where: { id: data.cobradorId, companyId: companyId! },
      select: { id: true, branchId: true },
    })
    if (!c) return NextResponse.json({ error: 'Cobrador no válido' }, { status: 400 })
  }

  const semanaInicio = new Date(`${data.semanaInicio}T00:00:00.000Z`)
  const semanaFin = calcularSemanaFin(data.semanaInicio)

  const goal = await prisma.goal.create({
    data: {
      companyId: companyId!,
      branchId:   data.branchId   ?? null,
      cobradorId: data.cobradorId ?? null,
      loanType:   data.loanType   ?? null,
      semanaInicio,
      semanaFin,
      metaCapitalColocado:   data.metaCapitalColocado   ?? null,
      metaCreditosColocados: data.metaCreditosColocados ?? null,
      metaCobranzaEsperada:  data.metaCobranzaEsperada  ?? null,
      metaCobranzaEfectiva:  data.metaCobranzaEfectiva  ?? null,
      metaMoraMaxima:        data.metaMoraMaxima        ?? null,
      metaCrecimiento:       data.metaCrecimiento       ?? null,
      notas: data.notas ?? null,
      creadoPorId: userId,
    },
  })

  createAuditLog({
    userId,
    accion: 'CREATE',
    tabla: 'Goal',
    registroId: goal.id,
    valoresNuevos: { ...data },
    ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
  })

  return NextResponse.json({ goal }, { status: 201 })
}
