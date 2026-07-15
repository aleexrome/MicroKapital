import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { parseMxYMD } from '@/lib/timezone'

const createSchema = z.object({
  branchId: z.string().uuid(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD'),
  monto: z.number().positive(),
  concepto: z.string().max(200).optional().nullable(),
})

/**
 * Registra un retiro de recurso que Dirección hace desde una sucursal.
 * Espejo negativo de /api/banca/adicional: se resta del "Neto para
 * banca" en /banca. Solo DG / DC / SUPER_ADMIN.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, id: userId } = session.user
  if (rol !== 'DIRECTOR_GENERAL' && rol !== 'DIRECTOR_COMERCIAL' && rol !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }
  if (!companyId) return NextResponse.json({ error: 'Sin empresa' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const branch = await prisma.branch.findFirst({
    where: { id: parsed.data.branchId, companyId },
    select: { id: true },
  })
  if (!branch) return NextResponse.json({ error: 'Sucursal no encontrada' }, { status: 404 })

  const registro = await prisma.branchWithdrawal.create({
    data: {
      companyId,
      branchId: parsed.data.branchId,
      fecha: parseMxYMD(parsed.data.fecha),
      monto: parsed.data.monto,
      concepto: parsed.data.concepto?.trim() || null,
      createdById: userId,
    },
  })

  return NextResponse.json({ data: registro }, { status: 201 })
}
