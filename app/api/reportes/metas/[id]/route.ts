import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'

const ROLES_DEFINEN = ['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL'] as const

const patchSchema = z.object({
  semanaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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

function calcularSemanaFin(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  const lunes = new Date(Date.UTC(y, m - 1, d))
  const domingo = new Date(lunes)
  domingo.setUTCDate(domingo.getUTCDate() + 6)
  return domingo
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { rol, companyId, id: userId } = session.user
  if (!ROLES_DEFINEN.includes(rol as typeof ROLES_DEFINEN[number])) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const existing = await prisma.goal.findFirst({
    where: { id: params.id, companyId: companyId! },
  })
  if (!existing) return NextResponse.json({ error: 'Meta no encontrada' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.issues }, { status: 400 })
  }
  const data = parsed.data

  const updateData: Record<string, unknown> = {}
  if (data.semanaInicio) {
    updateData.semanaInicio = new Date(`${data.semanaInicio}T00:00:00.000Z`)
    updateData.semanaFin = calcularSemanaFin(data.semanaInicio)
  }
  if ('branchId'   in data) updateData.branchId   = data.branchId   ?? null
  if ('cobradorId' in data) updateData.cobradorId = data.cobradorId ?? null
  if ('loanType'   in data) updateData.loanType   = data.loanType   ?? null
  if ('metaCapitalColocado'   in data) updateData.metaCapitalColocado   = data.metaCapitalColocado   ?? null
  if ('metaCreditosColocados' in data) updateData.metaCreditosColocados = data.metaCreditosColocados ?? null
  if ('metaCobranzaEsperada'  in data) updateData.metaCobranzaEsperada  = data.metaCobranzaEsperada  ?? null
  if ('metaCobranzaEfectiva'  in data) updateData.metaCobranzaEfectiva  = data.metaCobranzaEfectiva  ?? null
  if ('metaMoraMaxima'        in data) updateData.metaMoraMaxima        = data.metaMoraMaxima        ?? null
  if ('metaCrecimiento'       in data) updateData.metaCrecimiento       = data.metaCrecimiento       ?? null
  if ('notas' in data) updateData.notas = data.notas ?? null

  const updated = await prisma.goal.update({
    where: { id: params.id },
    data: updateData,
  })

  createAuditLog({
    userId,
    accion: 'UPDATE',
    tabla: 'Goal',
    registroId: params.id,
    valoresAnteriores: { ...existing },
    valoresNuevos: { ...updateData },
    ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
  })

  return NextResponse.json({ goal: updated })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { rol, companyId, id: userId } = session.user
  if (!ROLES_DEFINEN.includes(rol as typeof ROLES_DEFINEN[number])) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const existing = await prisma.goal.findFirst({
    where: { id: params.id, companyId: companyId! },
  })
  if (!existing) return NextResponse.json({ error: 'Meta no encontrada' }, { status: 404 })

  await prisma.goal.delete({ where: { id: params.id } })

  createAuditLog({
    userId,
    accion: 'DELETE',
    tabla: 'Goal',
    registroId: params.id,
    valoresAnteriores: { ...existing },
    ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
  })

  return NextResponse.json({ ok: true })
}
