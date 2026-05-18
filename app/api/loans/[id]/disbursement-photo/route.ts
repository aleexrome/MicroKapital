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
import type { Prisma } from '@prisma/client'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

/**
 * POST /api/loans/[id]/disbursement-photo
 *
 * Candado 3 del flujo de activación. Sube la foto del desembolso y, en la
 * misma transacción, activa el préstamo y genera el calendario.
 *
 * **Activación grupal SOLIDARIA** (Loan.esCoordinadora):
 * Cuando el préstamo recibido es la COORDINADORA del grupo, la activación
 * se propaga a todos los integrantes en IN_ACTIVATION del mismo ciclo
 * (misma foto, mismo GPS, mismo timestamp). Si el préstamo recibido es un
 * INTEGRANTE no-coordinador del grupo, se rechaza pidiendo activar desde
 * el perfil de la coordinadora.
 *
 * Flujo legacy: préstamos viejos en ACTIVE sin foto sólo guardan la foto.
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

  // ── Determinar los préstamos a activar ────────────────────────────────────
  // Para SOLIDARIO con esCoordinadora: propagamos al resto del grupo en
  // IN_ACTIVATION del mismo ciclo. Para SOLIDARIO no-coordinador: rechazamos
  // y direccionamos al perfil de la coordinadora.
  type ActivableLoan = typeof loan
  let targetLoans: ActivableLoan[] = [loan]
  let activacionGrupal = false

  if (esFlujoNuevo && loan.tipo === 'SOLIDARIO' && loan.loanGroupId) {
    const esRenovacion = loan.loanOriginalId !== null
    const cicloFilter = esRenovacion
      ? { loanOriginalId: { not: null } }
      : { loanOriginalId: null }

    if (loan.esCoordinadora) {
      // Coordinadora: cargar todos los integrantes (incluyéndola) en IN_ACTIVATION.
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
      // Integrante no-coordinadora: buscar la coordinadora del grupo
      const coord = await prisma.loan.findFirst({
        where: {
          loanGroupId: loan.loanGroupId,
          esCoordinadora: true,
          ...cicloFilter,
          companyId: companyId!,
        },
        include: { client: { select: { nombreCompleto: true } } },
      })
      if (coord) {
        return NextResponse.json(
          {
            error: 'ACTIVAR_DESDE_COORDINADORA',
            message: `Este préstamo se activa con todo el grupo desde el perfil de la coordinadora: ${coord.client.nombreCompleto}.`,
            coordinadoraLoanId: coord.id,
            coordinadoraNombre: coord.client.nombreCompleto,
          },
          { status: 400 }
        )
      }
      // Sin coordinadora en el grupo (data legacy): fallback al flujo single.
    }
  }

  // ── Validación de candados — solo flujo nuevo, una vez por cada loan ─────
  if (esFlujoNuevo) {
    for (const target of targetLoans) {
      // Candado 1: contrato firmado (el contrato grupal SOLIDARIO cubre a todos
      // los integrantes por groupMembers).
      const contractWithSigned = await prisma.contract.findFirst({
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
      if (!contractWithSigned) {
        return NextResponse.json(
          {
            error: 'Falta el contrato firmado (candado 1)' + (activacionGrupal ? ` para ${target.id}` : ''),
          },
          { status: 400 }
        )
      }

      // Candado 2: pago de comisión completado
      const candado2OK = target.seguroMetodoPago !== null && !target.seguroPendiente
      if (!candado2OK) {
        return NextResponse.json(
          {
            error: 'Falta registrar el pago de comisión / seguro (candado 2) o aún está pendiente' + (activacionGrupal ? ` para algún integrante del grupo` : ''),
          },
          { status: 400 }
        )
      }
    }
  }

  // ── Recibir foto + coordenadas (compartido) ──────────────────────────────
  const formData = await req.formData()
  const file = formData.get('foto') as File | null
  const lat = formData.get('lat') as string | null
  const lng = formData.get('lng') as string | null
  const gpsSourceRaw = formData.get('gpsSource') as string | null
  const gpsSource = gpsSourceRaw === 'EXIF' || gpsSourceRaw === 'LIVE' ? gpsSourceRaw : null

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

  // ── Flujo legacy — solo guardar foto en este loan, sin propagar ──────────
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
        gpsSource,
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

  // ── Flujo nuevo (IN_ACTIVATION) ──────────────────────────────────────────
  // La foto + GPS se aplican a TODOS los loans del grupo. El calendario se
  // genera por separado para cada uno con sus propios montos/plazo.
  const fechaFoto = new Date()
  const parsedLat = lat ? parseFloat(lat) : null
  const parsedLng = lng ? parseFloat(lng) : null

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
        fechas = generarFechasQuincenales(fechaDesembolso, plazo)
      } else {
        fechas = fechaPrimerPagoRef
          ? generarFechasSemanalesDesde(fechaPrimerPagoRef, plazo)
          : generarFechasSemanales(fechaDesembolso, plazo)
      }

      const montoPorPago =
        target.tipo === 'AGIL'       ? Number(target.pagoDiario) :
        target.tipo === 'FIDUCIARIO' ? Number(target.pagoQuincenal) :
                                       Number(target.pagoSemanal)

      // 1. Guardar foto + GPS + ACTIVE
      await tx.loan.update({
        where: { id: target.id },
        data: {
          desembolsoFotoUrl: uploadResult.url,
          desembolsoLat: parsedLat,
          desembolsoLng: parsedLng,
          desembolsoFotoAt: fechaFoto,
          estado: 'ACTIVE',
          fechaDesembolso,
        },
      })

      // 2. PaymentSchedule
      const scheduleData = fechas.map((fecha, idx) => ({
        loanId: target.id,
        numeroPago: idx + 1,
        fechaVencimiento: fecha,
        montoEsperado: montoPorPago,
        estado: 'PENDING' as const,
      } satisfies Prisma.PaymentScheduleCreateManyInput))
      await tx.paymentSchedule.createMany({ data: scheduleData })

      // 3. Renovación → liquidar crédito original
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
    accion: activacionGrupal ? 'ACTIVATE_GROUP_VIA_DISBURSEMENT_PHOTO' : 'ACTIVATE_LOAN_VIA_DISBURSEMENT_PHOTO',
    tabla: 'Loan',
    registroId: loan.id,
    valoresNuevos: {
      desembolsoFotoUrl: uploadResult.url,
      lat: parsedLat,
      lng: parsedLng,
      gpsSource,
      estado: 'ACTIVE',
      ...(activacionGrupal ? { integrantesActivados: targetLoans.map((t) => t.id) } : {}),
      ...(loan.loanOriginalId ? { loanOriginalLiquidado: loan.loanOriginalId } : {}),
    },
  })

  // ── Notificaciones informativas ──────────────────────────────────────────
  try {
    const [directores] = await Promise.all([getDirectoresIds(prisma, companyId!)])

    if (activacionGrupal) {
      const clienteRow = await prisma.client.findUnique({
        where: { id: loan.clientId },
        select: { nombreCompleto: true },
      })
      const cobradorRow = await prisma.user.findUnique({
        where: { id: loan.cobradorId },
        select: { nombre: true },
      })
      const coordinadoraNombre = clienteRow?.nombreCompleto ?? 'coordinadora'
      const cobradorNombre = cobradorRow?.nombre ?? 'cobradora'

      await crearNotificacion(prisma, {
        companyId: companyId!,
        destinatariosIds: directores,
        tipo: 'PRESTAMO_ACTIVADO',
        nivel: 'INFORMATIVA',
        titulo: `Grupo solidario activado — ${targetLoans.length} integrantes`,
        mensaje: `Coordinadora ${coordinadoraNombre} · Cobradora: ${cobradorNombre}`,
        loanId: loan.id,
        clientId: loan.clientId,
      })
    } else {
      const [clienteRow, cobradorRow] = await Promise.all([
        prisma.client.findUnique({ where: { id: loan.clientId }, select: { nombreCompleto: true } }),
        prisma.user.findUnique({ where: { id: loan.cobradorId }, select: { nombre: true } }),
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
    }

    // Renovaciones liquidadas
    for (const target of targetLoans) {
      if (!target.loanOriginalId) continue
      const clienteRow = await prisma.client.findUnique({
        where: { id: target.clientId },
        select: { nombreCompleto: true },
      })
      const clienteNombre = clienteRow?.nombreCompleto ?? 'cliente'
      await crearNotificacion(prisma, {
        companyId: companyId!,
        destinatariosIds: [...directores, target.cobradorId],
        tipo: 'PRESTAMO_LIQUIDADO',
        nivel: 'INFORMATIVA',
        titulo: 'Préstamo liquidado completamente',
        mensaje: `${clienteNombre} — liquidado por renovación anticipada`,
        loanId: target.loanOriginalId,
        clientId: target.clientId,
      })
    }
  } catch (e) {
    console.error('[disbursement-photo] notif failed:', e)
  }

  return NextResponse.json({
    message: activacionGrupal
      ? `Grupo activado — ${targetLoans.length} integrantes con foto + calendario`
      : 'Préstamo activado — foto de desembolso registrada y calendario generado',
    url: uploadResult.url,
    activacionGrupal,
    integrantesActivados: targetLoans.length,
  })
}
