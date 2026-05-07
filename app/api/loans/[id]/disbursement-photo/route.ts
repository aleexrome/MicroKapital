import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { v2 as cloudinary } from 'cloudinary'
import {
  generarFechasSemanales, generarFechasHabiles, generarFechasQuincenales,
  generarFechasSemanalesDesde, generarFechasHabilesDesde,
} from '@/lib/business-days'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

/**
 * POST /api/loans/[id]/disbursement-photo
 *
 * Candado 3 del flujo de activación. Sube la foto del desembolso con GPS
 * y, en la misma transacción, cierra el flujo:
 *   - Cambia loan.estado de IN_ACTIVATION → ACTIVE
 *   - Genera PaymentSchedule (calendario de cuotas)
 *   - Si es renovación anticipada, liquida el crédito original
 *
 * Reglas:
 *   - Préstamo en IN_ACTIVATION
 *   - Candado 1 cumplido (contrato firmado)
 *   - Candado 2 cumplido (seguroMetodoPago set y NO seguroPendiente)
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

  if (loan.estado !== 'IN_ACTIVATION') {
    return NextResponse.json(
      { error: 'El préstamo no está en flujo de activación' },
      { status: 400 }
    )
  }

  if (loan.desembolsoFotoUrl) {
    return NextResponse.json({ error: 'Ya existe una foto de desembolso' }, { status: 400 })
  }

  // ── Candado 1: contrato firmado ──────────────────────────────────────────
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

  // ── Candado 2: pago de comisión completado ───────────────────────────────
  const candado2OK = loan.seguroMetodoPago !== null && !loan.seguroPendiente
  if (!candado2OK) {
    return NextResponse.json(
      { error: 'Falta registrar el pago de comisión / seguro (candado 2) o aún está pendiente de verificación' },
      { status: 400 }
    )
  }

  // ── Recibir foto + coordenadas ───────────────────────────────────────────
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

  // ── Generar fechas del calendario ────────────────────────────────────────
  const fechaDesembolso = loan.fechaDesembolso ?? new Date()
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

  // ── Transacción: foto + activación + calendario + liquidación renovación ─
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

      if (idsFinanciados && idsFinanciados.length > 0) {
        await tx.paymentSchedule.updateMany({
          where: { id: { in: idsFinanciados } },
          data: { estado: 'FINANCIADO', pagadoAt: new Date() },
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
        data: { estado: 'FINANCIADO', pagadoAt: new Date() },
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

  return NextResponse.json({
    message: 'Préstamo activado — foto de desembolso registrada y calendario de pagos generado',
    url: uploadResult.url,
  })
}
