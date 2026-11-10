import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { parseMxYMD } from '@/lib/timezone'
import { virtualToRealBranchId, virtualToTag } from '@/lib/banca/virtual-branches'

const createSchema = z.object({
  // Acepta branchId REAL (uuid) o virtual (formato "vb:<parentUuid>:<tag>").
  branchId: z.string().min(1),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD'),
  monto: z.number().positive(),
  concepto: z.string().max(200).optional().nullable(),
})

/**
 * Registra un aporte adicional que Dirección envía a una sucursal.
 * Solo DG / DC / SUPER_ADMIN — la vista /banca es exclusiva de dirección.
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

  // Si viene como virtual (ej. "vb:<toluca>:TOL_I"), resolvemos a branch
  // real + tag. Si es uuid plano, el tag es null.
  const realBranchId = virtualToRealBranchId(parsed.data.branchId)
  const subBranchTag = virtualToTag(parsed.data.branchId)

  const branch = await prisma.branch.findFirst({
    where: { id: realBranchId, companyId },
    select: { id: true },
  })
  if (!branch) return NextResponse.json({ error: 'Sucursal no encontrada' }, { status: 404 })

  const registro = await prisma.branchExtraFund.create({
    data: {
      companyId,
      branchId: realBranchId,
      // parseMxYMD ancla a las 06:00 UTC (medianoche CDMX) igual que en
      // el resto del sistema — así la fecha guardada corresponde al día
      // calendario que eligió el DG en el selector, sin sorpresas de TZ.
      fecha: parseMxYMD(parsed.data.fecha),
      monto: parsed.data.monto,
      concepto: parsed.data.concepto?.trim() || null,
      subBranchTag,
      createdById: userId,
    },
  })

  return NextResponse.json({ data: registro }, { status: 201 })
}
