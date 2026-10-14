import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import {
  computeExpiresAt,
  generateCodeCandidate,
} from '@/lib/transfer-codes'

const generateSchema = z.object({
  loanId:          z.string().uuid(),
  cuentaDestinoId: z.string().uuid(),
  montoEsperado:   z.number().positive(),
  tipo:            z.enum(['PAYMENT', 'COMISION_APERTURA', 'GROUP_PAYMENT']),
  scheduleId:      z.string().uuid().nullable().optional(),
  groupId:         z.string().uuid().nullable().optional(),
})

/**
 * POST /api/transfer-codes
 *
 * Genera un código único MK-XXXXXX para validar una transferencia que
 * la cobradora está a punto de pedirle al cliente. El código:
 *   - Vive 6 horas (expiresAt).
 *   - Es único a nivel global (@unique en BD).
 *   - Invalida los códigos previos activos del mismo (loan + tipo +
 *     scheduleId/groupId) — útil cuando la coord cambia de cuenta o se
 *     equivoca y quiere regenerar.
 *
 * El código se persiste de inmediato para que el cliente pueda recargar
 * la pantalla sin perderlo, y se vincula a la cuenta destino para que el
 * verificador sepa a qué cuenta debió llegar el dinero.
 *
 * Auth: cualquier usuario que pueda registrar pagos (coord, gerente,
 * gerente zonal, DG, super admin). La validación fuerte se hace en el
 * endpoint de registro de pago; aquí solo generamos el código.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { id: userId, companyId } = session.user

  const body = await req.json().catch(() => ({}))
  const parsed = generateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Body inválido: ' + JSON.stringify(parsed.error.flatten().fieldErrors) },
      { status: 400 },
    )
  }
  const { loanId, cuentaDestinoId, montoEsperado, tipo, scheduleId, groupId } = parsed.data

  // Verificar que el loan existe y es del mismo tenant.
  const loan = await prisma.loan.findFirst({
    where: { id: loanId, companyId: companyId! },
    select: { id: true },
  })
  if (!loan) {
    return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })
  }
  // Verificar que la cuenta es del mismo tenant y está activa.
  const cuenta = await prisma.companyBankAccount.findFirst({
    where: { id: cuentaDestinoId, companyId: companyId!, activa: true },
    select: { id: true },
  })
  if (!cuenta) {
    return NextResponse.json({ error: 'Cuenta destino inválida o inactiva' }, { status: 400 })
  }

  // Invalidar códigos activos previos del mismo intento (mismo loan + tipo
  // + schedule/group) para que al regenerar quede claro que el anterior
  // ya no se usa. Esto cubre el caso: la coord eligió cuenta A, generó
  // código, se equivocó, elige cuenta B — el código viejo queda invalidado.
  const now = new Date()
  await prisma.transferCode.updateMany({
    where: {
      loanId,
      tipo,
      scheduleId: scheduleId ?? null,
      groupId:    groupId ?? null,
      invalidatedAt: null,
      usedAt:        null,
      expiresAt:     { gt: now },
    },
    data: {
      invalidatedAt:     now,
      invalidatedReason: 'Regenerado por el coordinador',
    },
  })

  // Generar código único — en el caso extremadísimo de colisión en el
  // @unique, reintentamos hasta 5 veces antes de rendirnos.
  let created = null
  const expiresAt = computeExpiresAt()
  for (let intento = 0; intento < 5 && !created; intento++) {
    try {
      const codeCandidate = generateCodeCandidate()
      created = await prisma.transferCode.create({
        data: {
          code:            codeCandidate,
          companyId:       companyId!,
          loanId,
          cuentaDestinoId,
          montoEsperado,
          tipo,
          scheduleId:      scheduleId ?? null,
          groupId:         groupId ?? null,
          createdById:     userId,
          expiresAt,
        },
      })
    } catch (e: unknown) {
      // Si es colisión del @unique en code, continuar reintentando.
      // Cualquier otro error se propaga.
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('Unique constraint') || !msg.includes('code')) {
        throw e
      }
    }
  }

  if (!created) {
    return NextResponse.json(
      { error: 'No se pudo generar un código único — reintenta' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    id:        created.id,
    code:      created.code,
    expiresAt: created.expiresAt.toISOString(),
  })
}
