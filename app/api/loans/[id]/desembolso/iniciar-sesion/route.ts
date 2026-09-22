import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import {
  generarPalabraDelDia,
  armarGuion,
  SESION_DESEMBOLSO_TTL_MS,
} from '@/lib/desembolso-video'

/**
 * POST /api/loans/[id]/desembolso/iniciar-sesion
 *
 * Genera una "palabra del dia" (nonce hablable) que el cliente debe
 * decir dentro del video de desembolso. La sesion vive 5 minutos —
 * si el video se sube despues de ese plazo, el server rechaza.
 *
 * Es la primera pieza del flujo anti-fraude para video de desembolso:
 * como el nonce se genera en el momento y expira rapido, un coord
 * malicioso no puede reusar un video viejo para "adelantar" un
 * desembolso a una fecha futura.
 *
 * Permisos: mismo rol que puede subir la foto de desembolso
 * (COORDINADOR / GERENTE / GERENTE_ZONAL asignados al prestamo o
 * SUPER_ADMIN).
 *
 * Response:
 *   { palabraDelDia, guion, expiraEnMs }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
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
    select: {
      id: true,
      estado: true,
      capital: true,
      branchId: true,
      cobradorId: true,
      client: { select: { nombreCompleto: true } },
      desembolsoVideoUrl: true,
      // Necesarios para validar los candados previos (contrato +
      // comision) — no arrancamos la grabacion si algo falta.
      seguroMetodoPago: true,
      seguroPendiente: true,
    },
  })
  if (!loan) return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })

  // Permisos por rol: solo dueños del prestamo pueden grabar (SA
  // pasa siempre). Es simetrico a disbursement-photo.
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

  // Estado permitido: IN_ACTIVATION (flujo nuevo estandar) o ACTIVE
  // sin video (legacy que llego a ACTIVE con solo foto; permitir
  // "regularizar" agregando video). Bloqueamos si ya tiene video.
  const flujoOk = loan.estado === 'IN_ACTIVATION'
    || (loan.estado === 'ACTIVE' && !loan.desembolsoVideoUrl)
  if (!flujoOk) {
    return NextResponse.json(
      { error: 'El préstamo no está en flujo de desembolso o ya tiene video' },
      { status: 400 },
    )
  }
  if (loan.desembolsoVideoUrl) {
    return NextResponse.json(
      { error: 'Este préstamo ya tiene un video de desembolso aprobado' },
      { status: 400 },
    )
  }

  // ── Candados 1 y 2 — solo si el prestamo esta en IN_ACTIVATION ────
  // (los ACTIVE legacy sin video no pasan por los candados formales
  // porque nacieron pre-fase 6).
  //
  // Estos mismos checks se corren tambien en /upload como backstop,
  // pero validarlos aqui evita que el coord grabe/procese un video
  // que luego el server va a rechazar por candado. Ademas ahorra el
  // costo de Whisper + Vision.
  if (loan.estado === 'IN_ACTIVATION') {
    const contract = await prisma.contract.findFirst({
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
    if (!contract) {
      return NextResponse.json(
        { error: 'Falta el contrato firmado (candado 1). Sube el PDF firmado antes de grabar el video.' },
        { status: 400 },
      )
    }
    if (loan.seguroMetodoPago === null) {
      return NextResponse.json(
        { error: 'Falta cobrar la comisión de apertura (candado 2). Regístralo antes de grabar el video.' },
        { status: 400 },
      )
    }
    if (loan.seguroPendiente) {
      return NextResponse.json(
        { error: 'La comisión de apertura se pagó por transferencia y aún no se verifica. Espera la verificación antes de grabar el video.' },
        { status: 400 },
      )
    }
  }

  // Generar palabra del dia + guardar sesion.
  const palabraDelDia = generarPalabraDelDia()
  const iniciadaAt = new Date()
  await prisma.loan.update({
    where: { id: loan.id },
    data: {
      desembolsoPalabraDelDia:    palabraDelDia,
      desembolsoSesionIniciadaAt: iniciadaAt,
    },
  })

  const guion = armarGuion({
    nombreCliente: loan.client.nombreCompleto,
    fechaHoy:      iniciadaAt,
    monto:         Number(loan.capital),
    palabraDelDia,
  })

  createAuditLog({
    userId,
    accion: 'DESEMBOLSO_VIDEO_SESION_INICIADA',
    tabla: 'Loan',
    registroId: loan.id,
    valoresNuevos: { palabraDelDia, iniciadaAt: iniciadaAt.toISOString() },
    ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
  })

  return NextResponse.json({
    palabraDelDia,
    guion,
    // TTL en ms del lado del cliente para que la UI muestre un contador
    // regresivo y bloquee submit si el usuario tarda demasiado.
    expiraEnMs: SESION_DESEMBOLSO_TTL_MS,
    iniciadaAt: iniciadaAt.toISOString(),
    // Datos del prestamo utiles para armar la UI del guion en frontend
    // sin volver a pegar a otro endpoint.
    prestamo: {
      clienteNombre: loan.client.nombreCompleto,
      capital:       Number(loan.capital),
    },
  })
}
