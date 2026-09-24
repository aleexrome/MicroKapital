import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { v2 as cloudinary } from 'cloudinary'
import {
  generarFechasSemanales, generarFechasHabiles, generarFechasFiduciario,
  generarFechasSemanalesDesde, generarFechasHabilesDesde,
} from '@/lib/business-days'
import { todayMx } from '@/lib/timezone'
import { crearNotificacion, getDirectoresIds } from '@/lib/notifications'
import type { Prisma } from '@prisma/client'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

/**
 * POST /api/loans/[id]/transferencia-foto
 *
 * Flujo de "Activación Virtual" — para 3 clientes 100% online que
 * no pueden grabar video. El coord sube la foto del comprobante de
 * transferencia bancaria y el prestamo se activa en la misma
 * transaccion. Sin Whisper ni Vision — solo evidencia auditada.
 *
 * Requiere:
 *   - loan.activacionVirtual === true (marcado por DG al aprobar)
 *   - loan.estado === 'IN_ACTIVATION'
 *   - Candado 1: contrato firmado
 *   - Candado 2: comision de apertura pagada
 *
 * SOLIDARIO: si el prestamo es coord de un grupo, se activa TODO el
 * grupo del ciclo (misma foto de transferencia como evidencia
 * compartida). Los no-coord son rechazados con ACTIVAR_DESDE_COORDINADORA.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rol, companyId, id: userId } = session.user

  const rolesPermitidos = ['COORDINADOR', 'GERENTE', 'GERENTE_ZONAL', 'SUPER_ADMIN']
  if (!rolesPermitidos.includes(rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const loan = await prisma.loan.findFirst({
    where: { id: params.id, companyId: companyId! },
  })
  if (!loan) return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })

  // Permisos por rol
  let allowed = false
  if (rol === 'SUPER_ADMIN') allowed = true
  else if (rol === 'COORDINADOR' || rol === 'GERENTE') allowed = loan.cobradorId === userId
  else if (rol === 'GERENTE_ZONAL') {
    const zoneIds = session.user.zonaBranchIds
    allowed = (Array.isArray(zoneIds) && zoneIds.includes(loan.branchId)) || loan.cobradorId === userId
  }
  if (!allowed) return NextResponse.json({ error: 'Sin permisos sobre este préstamo' }, { status: 403 })

  // Este endpoint SOLO es para prestamos marcados como activacion virtual.
  if (!loan.activacionVirtual) {
    return NextResponse.json({
      error: 'Este préstamo no está marcado como Activación Virtual. Usa el flujo normal (video de desembolso).',
    }, { status: 400 })
  }

  if (loan.estado !== 'IN_ACTIVATION') {
    return NextResponse.json({
      error: 'El préstamo no está en flujo de activación',
    }, { status: 400 })
  }

  if (loan.transferenciaFotoUrl) {
    return NextResponse.json({
      error: 'Este préstamo ya tiene foto de transferencia registrada',
    }, { status: 400 })
  }

  // ── Grupo SOLIDARIO: propagar al resto del grupo (mismo ciclo) ────
  type ActivableLoan = typeof loan
  let targetLoans: ActivableLoan[] = [loan]
  let activacionGrupal = false

  if (loan.tipo === 'SOLIDARIO' && loan.loanGroupId) {
    const esRenovacion = loan.loanOriginalId !== null
    const cicloFilter = esRenovacion
      ? { loanOriginalId: { not: null } }
      : { loanOriginalId: null }

    if (loan.esCoordinadora) {
      const integrantes = await prisma.loan.findMany({
        where: {
          loanGroupId: loan.loanGroupId,
          estado: 'IN_ACTIVATION',
          ...cicloFilter,
          companyId: companyId!,
        },
      }) as ActivableLoan[]
      if (integrantes.length > 0) {
        targetLoans = integrantes
        activacionGrupal = integrantes.length > 1
      }
    } else {
      const coord = await prisma.loan.findFirst({
        where: {
          loanGroupId: loan.loanGroupId,
          esCoordinadora: true,
          ...cicloFilter,
          companyId: companyId!,
        },
        include: { client: { select: { nombreCompleto: true } } },
      })
      return NextResponse.json({
        error: 'ACTIVAR_DESDE_COORDINADORA',
        message: coord
          ? `Este préstamo se activa con todo el grupo desde el perfil de la coordinadora: ${coord.client.nombreCompleto}.`
          : 'Este préstamo forma parte de un grupo solidario y se activa desde el perfil de la coordinadora.',
        coordinadoraLoanId: coord?.id ?? null,
      }, { status: 400 })
    }
  }

  // ── Candados 1 y 2 — por integrante ─────────────────────────────
  for (const target of targetLoans) {
    const contract = await prisma.contract.findFirst({
      where: {
        companyId: companyId!,
        loanDocumentFirmadoId: { not: null },
        OR: [
          { loanId: target.id },
          { groupMembers: { some: { loanId: target.id } } },
        ],
      },
      select: { id: true },
    })
    if (!contract) {
      return NextResponse.json({
        error: 'Falta el contrato firmado (candado 1)' + (activacionGrupal ? ` para ${target.id}` : ''),
      }, { status: 400 })
    }
    if (target.seguroMetodoPago === null || target.seguroPendiente) {
      return NextResponse.json({
        error: 'Falta el pago de comisión / seguro (candado 2)' + (activacionGrupal ? ` para algún integrante del grupo` : ''),
      }, { status: 400 })
    }
  }

  // ── Recibir la foto del comprobante ─────────────────────────────
  // Se acepta como multipart/form-data — la foto pasa por Vercel al
  // server (max 4.5MB, cabe una captura de app bancaria con margen).
  const formData = await req.formData()
  const file = formData.get('foto') as File | null
  if (!file) {
    return NextResponse.json({ error: 'Foto del comprobante requerida' }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  const uploadResult = await new Promise<{ url: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'microkapital/transferencias',
        public_id: `${loan.id}-${Date.now()}`,
        resource_type: 'image',
        type: 'upload',
        access_mode: 'public',
        quality: 'auto',
        fetch_format: 'auto',
        transformation: [{ width: 1600, crop: 'limit' }],
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error('Upload failed'))
          return
        }
        resolve({ url: result.secure_url })
      }
    )
    stream.end(buffer)
  })

  // ── Activación (misma lógica que disbursement-photo/upload) ─────
  const fechaFoto = new Date()

  await prisma.$transaction(async (tx) => {
    for (const target of targetLoans) {
      const fechaDesembolso = target.fechaDesembolso ?? todayMx()
      const fechaPrimerPagoRef = target.fechaPrimerPago ?? null
      const plazo = Number(target.plazo)

      let fechas: Date[]
      if (target.tipo === 'AGIL') {
        fechas = fechaPrimerPagoRef
          ? generarFechasHabilesDesde(fechaPrimerPagoRef, plazo)
          : generarFechasHabiles(fechaDesembolso, plazo)
      } else if (target.tipo === 'FIDUCIARIO') {
        fechas = generarFechasFiduciario(fechaDesembolso, plazo)
      } else {
        fechas = fechaPrimerPagoRef
          ? generarFechasSemanalesDesde(fechaPrimerPagoRef, plazo)
          : generarFechasSemanales(fechaDesembolso, plazo)
      }

      const montoPorPago =
        target.tipo === 'AGIL'       ? Number(target.pagoDiario) :
        target.tipo === 'FIDUCIARIO' ? Number(target.pagoQuincenal) :
                                       Number(target.pagoSemanal)

      // La foto de transferencia solo se guarda en el prestamo donde
      // el coord la subio. Los demas integrantes del grupo se activan
      // pero conservan transferenciaFotoUrl = null (queda en la coord).
      const dataUpdate: Prisma.LoanUpdateInput = {
        estado: 'ACTIVE',
        fechaDesembolso,
      }
      if (target.id === loan.id) {
        dataUpdate.transferenciaFotoUrl     = uploadResult.url
        dataUpdate.transferenciaFotoAt      = fechaFoto
        dataUpdate.transferenciaSubidaPorId = userId
      }
      await tx.loan.update({ where: { id: target.id }, data: dataUpdate })

      const scheduleData = fechas.map((fecha, idx) => ({
        loanId: target.id,
        numeroPago: idx + 1,
        fechaVencimiento: fecha,
        montoEsperado: montoPorPago,
        estado: 'PENDING' as const,
      } satisfies Prisma.PaymentScheduleCreateManyInput))
      await tx.paymentSchedule.createMany({ data: scheduleData })

      // Renovación → liquidar crédito original
      if (target.loanOriginalId) {
        const idsFinanciados = Array.isArray(target.pagosFinanciadosIds)
          ? (target.pagosFinanciadosIds as string[])
          : null
        const pagadoAtMx = todayMx()
        if (idsFinanciados && idsFinanciados.length > 0) {
          await tx.paymentSchedule.updateMany({
            where: { id: { in: idsFinanciados } },
            data: { estado: 'FINANCIADO', pagadoAt: pagadoAtMx },
          })
        }
        await tx.paymentSchedule.updateMany({
          where: {
            loanId: target.loanOriginalId,
            estado: { in: ['PENDING', 'OVERDUE', 'PARTIAL'] },
            ...(idsFinanciados?.length ? { id: { notIn: idsFinanciados } } : {}),
          },
          data: { estado: 'FINANCIADO', pagadoAt: pagadoAtMx },
        })
        await tx.loan.update({
          where: { id: target.loanOriginalId },
          data: { estado: 'LIQUIDATED' },
        })
      }
    }
  })

  createAuditLog({
    userId,
    accion: activacionGrupal
      ? 'ACTIVATE_GROUP_VIA_TRANSFERENCIA_VIRTUAL'
      : 'ACTIVATE_LOAN_VIA_TRANSFERENCIA_VIRTUAL',
    tabla: 'Loan',
    registroId: loan.id,
    valoresNuevos: {
      transferenciaFotoUrl: uploadResult.url,
      estado: 'ACTIVE',
      activacionVirtual: true,
      ...(activacionGrupal ? { integrantesActivados: targetLoans.map((t) => t.id) } : {}),
      ...(loan.loanOriginalId ? { loanOriginalLiquidado: loan.loanOriginalId } : {}),
    },
  })

  // Notificar a Direccion (informativa)
  try {
    const directores = await getDirectoresIds(prisma, companyId!)
    const clienteRow = await prisma.client.findUnique({
      where: { id: loan.clientId }, select: { nombreCompleto: true },
    })
    const cobradorRow = await prisma.user.findUnique({
      where: { id: loan.cobradorId }, select: { nombre: true },
    })
    const clienteNombre = clienteRow?.nombreCompleto ?? 'cliente'
    const cobradorNombre = cobradorRow?.nombre ?? 'cobradora'

    await crearNotificacion(prisma, {
      companyId: companyId!,
      destinatariosIds: directores,
      tipo: 'PRESTAMO_ACTIVADO',
      nivel: 'INFORMATIVA',
      titulo: activacionGrupal
        ? `Grupo activado por transferencia (virtual) — ${targetLoans.length} integrantes`
        : 'Préstamo activado por transferencia (virtual)',
      mensaje: `${clienteNombre} — Cobradora: ${cobradorNombre}`,
      loanId: loan.id,
      clientId: loan.clientId,
    })
  } catch (e) {
    console.error('[transferencia-foto] notif failed:', e)
  }

  return NextResponse.json({
    ok: true,
    url: uploadResult.url,
    message: activacionGrupal
      ? `Grupo activado — ${targetLoans.length} integrantes`
      : 'Préstamo activado con foto de transferencia',
  })
}
