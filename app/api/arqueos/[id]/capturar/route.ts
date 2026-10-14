import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import {
  calcularEsperadoSemana,
  semanaMKActual,
} from '@/lib/arqueos'

const capturarSchema = z.object({
  desgloseEfectivo: z.array(z.object({
    denominacion: z.number().positive(),
    cantidad:     z.number().int().min(0),
  })),
  totalTransferenciasDeclarado: z.number().min(0),
})

/**
 * POST /api/arqueos/[id]/capturar
 *
 * El usuario target envía su captura: desglose por denominación +
 * total declarado de transferencias de la semana MK en curso.
 *
 * El sistema calcula el ESPERADO ahora (snapshot inmutable) para que
 * la comparativa quede fija aunque luego se cancelen pagos. El
 * desglose se guarda como JSON — no hace falta otra tabla.
 *
 * Importante: `id` en la URL es el `arqueoId`, no el capturaId. Se
 * busca la captura PENDIENTE del user en ese arqueo.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const captura = await prisma.arqueoCaptura.findFirst({
    where: {
      arqueoId:    params.id,
      userId:      session.user.id,
      capturadoAt: null,
      canceladoAt: null,
      arqueo:      { canceladoAt: null },
    },
  })
  if (!captura) {
    return NextResponse.json(
      { error: 'No se encontró un arqueo pendiente para capturar' },
      { status: 404 },
    )
  }

  const body = await req.json().catch(() => ({}))
  const parsed = capturarSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', detail: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  // Normalizar desglose (ignorar entradas con cantidad 0 para que el
  // JSON no se llene de ceros ruidosos) y calcular total efectivo.
  const desglose = parsed.data.desgloseEfectivo
    .filter((e) => e.cantidad > 0)
    .map((e) => ({
      denominacion: e.denominacion,
      cantidad:     e.cantidad,
      subtotal:     e.denominacion * e.cantidad,
    }))
  const totalEfectivoDeclarado = desglose.reduce((s, e) => s + e.subtotal, 0)

  // Esperado del sistema — snapshot al momento de capturar.
  const semana = semanaMKActual()
  const esperado = await calcularEsperadoSemana(
    prisma,
    session.user.id,
    session.user.companyId!,
    semana,
  )

  const now = new Date()
  await prisma.arqueoCaptura.update({
    where: { id: captura.id },
    data: {
      capturadoAt: now,
      desgloseEfectivo: desglose,
      totalEfectivoDeclarado:       totalEfectivoDeclarado,
      totalTransferenciasDeclarado: parsed.data.totalTransferenciasDeclarado,
      totalEfectivoEsperado:        esperado.efectivo,
      totalTransferenciasEsperado:  esperado.transferencias,
      semanaMKSabado:               semana.sabado,
    },
  })

  createAuditLog({
    userId:        session.user.id,
    accion:        'CAPTURAR_ARQUEO',
    tabla:         'ArqueoCaptura',
    registroId:    captura.id,
    valoresNuevos: {
      arqueoId: captura.arqueoId,
      totalEfectivoDeclarado,
      totalTransferenciasDeclarado: parsed.data.totalTransferenciasDeclarado,
      diffEfectivo:       totalEfectivoDeclarado - esperado.efectivo,
      diffTransferencias: parsed.data.totalTransferenciasDeclarado - esperado.transferencias,
    },
  })

  return NextResponse.json({ ok: true })
}
