import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { v2 as cloudinary } from 'cloudinary'
import {
  generarFechasSemanales, generarFechasHabiles, generarFechasQuincenales,
  generarFechasSemanalesDesde, generarFechasHabilesDesde,
} from '@/lib/business-days'
import { todayMx } from '@/lib/timezone'
import { crearNotificacion, getDirectoresIds } from '@/lib/notifications'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

/**
 * POST /api/loans/[id]/disbursement-photo
 *
 * Soporta dos flujos:
 *
 *  1) Flujo nuevo (Fase 6) — préstamo en IN_ACTIVATION:
 *     candado 3 del flujo de activación. Sube la foto del desembolso con
 *     GPS y, en la misma transacción, cierra el flujo:
 *       - Cambia loan.estado de IN_ACTIVATION → ACTIVE
 *       - Genera PaymentSchedule (calendario de cuotas)
 *       - Si es renovación anticipada, liquida el crédito original
 *     Requiere candados 1 (contrato firmado) y 2 (pago de comisión OK).
 *
 *  2) Flujo legacy — préstamo en ACTIVE sin foto:
 *     préstamos viejos activados antes de Fase 6 que aún no tienen foto.
 *     Solo sube la foto y guarda los metadatos (lat/lng/fotoAt). NO toca
 *     estado, NO genera calendario, NO valida candados.
 *
 * Permisos: SUPER_ADMIN, COORDINADOR/GERENTE/GERENTE_ZONAL del préstamo.
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
  if (!loan) {
    return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })
  }

  // Permisos por rol
  let allowed = false
  if (rol === 'SUPER_ADMIN') {
    allowed = true
  } else if (rol === 'COORDINADOR' || rol === 'GERENTE') {
    allowed = loan.cobradorId === userId
  } else if (rol === 'GERENTE_ZONAL') {
    const zoneIds = session.user.zonaBranchIds
    allowed = (Array.isArray(zoneIds) && zoneIds.includes(loan.branchId)) || loan.cobradorId === userId
  }
  if (!allowed) {
    return NextResponse.json({ error: 'Sin permisos sobre este préstamo' }, { status: 403 })
  }

  const esFlujoNuevo = loan.estado === 'IN_ACTIVATION'
  const esLegacyActivePendiente = loan.estado === 'ACTIVE' && !loan.desembolsoFotoUrl

  if (!esFlujoNuevo && !esLegacyActivePendiente) {
    return NextResponse.json(
      { error: 'El préstamo no está en flujo de activación o ya tiene foto de desembolso' },
      { status: 400 }
    )
  }

  // Defensivo: en IN_ACTIVATION no debería haber foto previa, pero por si acaso.
  if (esFlujoNuevo && loan.desembolsoFotoUrl) {
    return NextResponse.json({ error: 'Ya existe una foto de desembolso' }, { status: 400 })
  }

  // ── Validación de candados — solo flujo nuevo ────────────────────────────
  if (esFlujoNuevo) {
    // Candado 1: contrato firmado
    const contractWithSigned = await prisma.contract.findFirst({
      where: {
        companyId: companyId!,
        loanDocumentFirmadoId: { not: null },
        OR: [
          { loanId: loan.id },
          { groupMembers: { some: { loanId: loan.id } } },
        ],
      },
      select: { id: true },
    })
    if (!contractWithSigned) {
      return NextResponse.json(
        { error: 'Falta el contrato firmado del cliente (candado 1)' },
        { status: 400 }
      )
    }

    // Candado 2: pago de comisión completado
    const candado2OK = loan.seguroMetodoPago !== null && !loan.seguroPendiente
    if (!candado2OK) {
      return NextResponse.json(
        { error: 'Falta registrar el pago de comisión / seguro (candado 2) o aún está pendiente de verificación' },
        { status: 400 }
      )
    }
  }

  // ── Recibir foto + coordenadas (compartido) ──────────────────────────────
  const formData = await req.formData()
  const file = formData.get('foto') as File | null
  const lat = formData.get('lat') as string | null
  const lng = formData.get('lng') as string | null

  if (!file) {
    return NextResponse.json({ error: 'Foto requerida' }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  const uploadResult = await new Promise<{ url: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'microkapital/desembolsos',
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

  // ── Flujo legacy — solo guardar foto, sin tocar estado ni calendario ─────
  if (esLegacyActivePendiente) {
    await prisma.loan.update({
      where: { id: loan.id },
      data: {
        desembolsoFotoUrl: uploadResult.url,
        desembolsoLat: lat ? parseFloat(lat) : null,
        desembolsoLng: lng ? parseFloat(lng) : null,
        desembolsoFotoAt: new Date(),
      },
    })

    createAuditLog({
      userId,
      accion: 'UPLOAD_DISBURSEMENT_PHOTO_LEGACY',
      tabla: 'Loan',
      registroId: loan.id,
      valoresNuevos: {
        desembolsoFotoUrl: uploadResult.url,
        lat: lat ? parseFloat(lat) : null,
        lng: lng ? parseFloat(lng) : null,
        modo: 'legacy',
      },
    })

    return NextResponse.json({
      ok: true,
      modo: 'legacy',
      message: 'Foto de desembolso registrada',
      url: uploadResult.url,
    })
  }

  // ── Flujo nuevo (IN_ACTIVATION) — calendario + activación ────────────────
  // Generar fechas del calendario.
  // todayMx() devuelve 06:00 UTC del día calendario CDMX. Importante para
  // que la fecha caiga en la semana correcta de los reportes (sáb–vie CDMX).
  const fechaDesembolso = loan.fechaDesembolso ?? todayMx()
  const fechaPrimerPagoRef = loan.fechaPrimerPago ?? null
  const plazo = Number(loan.plazo)

  let fechas: Date[]
  if (loan.tipo === 'AGIL') {
    fechas = fechaPrimerPagoRef
      ? generarFechasHabilesDesde(fechaPrimerPagoRef, plazo)
      : generarFechasHabiles(fechaDesembolso, plazo)
  } else if (loan.tipo === 'FIDUCIARIO') {
    fechas = generarFechasQuincenales(fechaDesembolso, plazo)
  } else {
    fechas = fechaPrimerPagoRef
      ? generarFechasSemanalesDesde(fechaPrimerPagoRef, plazo)
      : generarFechasSemanales(fechaDesembolso, plazo)
  }

  const montoPorPago =
    loan.tipo === 'AGIL'       ? Number(loan.pagoDiario) :
    loan.tipo === 'FIDUCIARIO' ? Number(loan.pagoQuincenal) :
                                 Number(loan.pagoSemanal)

  // Transacción: foto + activación + calendario + liquidación renovación
  await prisma.$transaction(async (tx) => {
    // 1. Guardar foto + GPS y cambiar estado a ACTIVE
    await tx.loan.update({
      where: { id: loan.id },
      data: {
        desembolsoFotoUrl: uploadResult.url,
        desembolsoLat: lat ? parseFloat(lat) : null,
        desembolsoLng: lng ? parseFloat(lng) : null,
        desembolsoFotoAt: new Date(),
        estado: 'ACTIVE',
        fechaDesembolso,
      },
    })

    // 2. Generar PaymentSchedule
    const scheduleData = fechas.map((fecha, idx) => ({
      loanId: loan.id,
      numeroPago: idx + 1,
      fechaVencimiento: fecha,
      montoEsperado: montoPorPago,
      estado: 'PENDING' as const,
    }))
    await tx.paymentSchedule.createMany({ data: scheduleData })

    // 3. Si es renovación anticipada, liquidar el crédito original
    if (loan.loanOriginalId) {
      const idsFinanciados = Array.isArray(loan.pagosFinanciadosIds)
        ? (loan.pagosFinanciadosIds as string[])
        : null

      const pagadoAtMx = todayMx()
      if (idsFinanciados && idsFinanciados.length > 0) {
        await tx.paymentSchedule.updateMany({
          where: { id: { in: idsFinanciados } },
          data: { estado: 'FINANCIADO', pagadoAt: pagadoAtMx },
        })
      }

      // Pagos pendientes que NO fueron seleccionados también pasan a FINANCIADO
      // (mismo razonamiento que en el activate legacy: evita inflar la cobranza).
      await tx.paymentSchedule.updateMany({
        where: {
          loanId: loan.loanOriginalId,
          estado: { in: ['PENDING', 'OVERDUE', 'PARTIAL'] },
          ...(idsFinanciados?.length ? { id: { notIn: idsFinanciados } } : {}),
        },
        data: { estado: 'FINANCIADO', pagadoAt: pagadoAtMx },
      })

      await tx.loan.update({
        where: { id: loan.loanOriginalId },
        data: { estado: 'LIQUIDATED' },
      })
    }
  })

  createAuditLog({
    userId,
    accion: 'ACTIVATE_LOAN_VIA_DISBURSEMENT_PHOTO',
    tabla: 'Loan',
    registroId: loan.id,
    valoresNuevos: {
      desembolsoFotoUrl: uploadResult.url,
      lat: lat ? parseFloat(lat) : null,
      lng: lng ? parseFloat(lng) : null,
      estado: 'ACTIVE',
      ...(loan.loanOriginalId ? { loanOriginalLiquidado: loan.loanOriginalId } : {}),
    },
  })

  // ── Notificaciones informativas: préstamo activado + (si renovación)
  // crédito original liquidado. Best-effort, fuera del flujo crítico.
  try {
    const [clienteRow, cobradorRow, directores] = await Promise.all([
      prisma.client.findUnique({ where: { id: loan.clientId }, select: { nombreCompleto: true } }),
      prisma.user.findUnique({ where: { id: loan.cobradorId }, select: { nombre: true } }),
      getDirectoresIds(prisma, companyId!),
    ])
    const clienteNombre = clienteRow?.nombreCompleto ?? 'cliente'
    const cobradorNombre = cobradorRow?.nombre ?? 'cobradora'

    await crearNotificacion(prisma, {
      companyId: companyId!,
      destinatariosIds: directores,
      tipo: 'PRESTAMO_ACTIVADO',
      nivel: 'INFORMATIVA',
      titulo: 'Préstamo activado',
      mensaje: `${clienteNombre} por $${Number(loan.capital).toFixed(2)} — Cobradora: ${cobradorNombre}`,
      loanId: loan.id,
      clientId: loan.clientId,
    })

    if (loan.loanOriginalId) {
      await crearNotificacion(prisma, {
        companyId: companyId!,
        destinatariosIds: [...directores, loan.cobradorId],
        tipo: 'PRESTAMO_LIQUIDADO',
        nivel: 'INFORMATIVA',
        titulo: 'Préstamo liquidado completamente',
        mensaje: `${clienteNombre} — liquidado por renovación anticipada`,
        loanId: loan.loanOriginalId,
        clientId: loan.clientId,
      })
    }
  } catch (e) {
    console.error('[disbursement-photo] notif failed:', e)
  }

  return NextResponse.json({
    message: 'Préstamo activado — foto de desembolso registrada y calendario de pagos generado',
    url: uploadResult.url,
  })
}
