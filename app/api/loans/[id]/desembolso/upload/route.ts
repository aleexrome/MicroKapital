import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { v2 as cloudinary } from 'cloudinary'

// Whisper + Claude Vision juntos pueden tardar 15-25s, mas el upload
// a Cloudinary. Vercel default es 10s en Hobby, 60s en Pro. Le damos
// 60s de holgura para no cortarnos a media validacion.
export const maxDuration = 60
// Force nodejs runtime — necesitamos Buffer y librerias de node (edge
// runtime no soporta @anthropic-ai/sdk ni cloudinary).
export const runtime = 'nodejs'
import { todayMx } from '@/lib/timezone'
import { SESION_DESEMBOLSO_TTL_MS } from '@/lib/desembolso-video'
import {
  checkNombre, checkPalabraDelDia, checkFecha, checkMonto,
} from '@/lib/desembolso-video-checks'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import {
  generarFechasSemanales, generarFechasHabiles, generarFechasFiduciario,
  generarFechasSemanalesDesde, generarFechasHabilesDesde,
} from '@/lib/business-days'
import { crearNotificacion, getDirectoresIds } from '@/lib/notifications'
import type { Prisma } from '@prisma/client'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * POST /api/loans/[id]/desembolso/upload
 *
 * Recibe el video grabado por el coord/cliente y ejecuta la
 * validacion anti-fraude:
 *
 *   1. Sube el video a Cloudinary (folder microkapital/desembolsos-video).
 *   2. Transcribe el audio con Whisper (OpenAI).
 *   3. Extrae 3 frames del video (2s, mitad, 90%) via URL de Cloudinary
 *      y los pasa a Claude Vision para verificar si se ve dinero.
 *   4. Corre los 5 checks (nombre / fecha / monto / palabra del dia /
 *      dinero visible) contra la transcripcion y el analisis visual.
 *   5. Si TODOS pasan: activa el prestamo (mismo comportamiento que
 *      disbursement-photo, incluye propagacion grupal SOLIDARIO).
 *   6. Si algo falla: guarda la validacion, incrementa
 *      desembolsoIntentos, y regresa las razones al frontend para que
 *      el coord regrabe.
 *
 * Permisos: mismo rol que puede subir la foto de desembolso.
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
    include: { client: { select: { nombreCompleto: true } } },
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

  // Sesion debe existir y estar viva
  if (!loan.desembolsoPalabraDelDia || !loan.desembolsoSesionIniciadaAt) {
    return NextResponse.json(
      { error: 'No hay sesión de desembolso iniciada. Llama /iniciar-sesion primero.' },
      { status: 400 },
    )
  }
  const edadSesionMs = Date.now() - loan.desembolsoSesionIniciadaAt.getTime()
  if (edadSesionMs > SESION_DESEMBOLSO_TTL_MS) {
    return NextResponse.json(
      { error: 'La sesión expiró. Reinicia con /iniciar-sesion para obtener una palabra nueva.' },
      { status: 400 },
    )
  }

  const esFlujoNuevo = loan.estado === 'IN_ACTIVATION'
  const esLegacyActivePendiente = loan.estado === 'ACTIVE' && !loan.desembolsoVideoUrl
  if (!esFlujoNuevo && !esLegacyActivePendiente) {
    return NextResponse.json(
      { error: 'El préstamo no está en flujo de desembolso o ya tiene video aprobado' },
      { status: 400 },
    )
  }

  // ── Recibir video + GPS ─────────────────────────────────────────────
  const formData = await req.formData()
  const file = formData.get('video') as File | null
  const lat = formData.get('lat') as string | null
  const lng = formData.get('lng') as string | null
  if (!file) return NextResponse.json({ error: 'Video requerido' }, { status: 400 })

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  // 1. Subir a Cloudinary como video
  const uploadResult = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'microkapital/desembolsos-video',
        public_id: `${loan.id}-${Date.now()}`,
        resource_type: 'video',
        type: 'upload',
        access_mode: 'public',
      },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Cloudinary video upload failed'))
        resolve({ secure_url: result.secure_url, public_id: result.public_id })
      },
    )
    stream.end(buffer)
  })
  const videoUrl = uploadResult.secure_url

  // 2. Transcribir audio con Whisper. Convertimos el buffer a un File-like
  //    que el SDK acepta. Whisper soporta webm/mp4/mp3/wav etc.
  let transcripcion = ''
  try {
    const whisperFile = new File([buffer], file.name || 'video.webm', {
      type: file.type || 'video/webm',
    })
    const resp = await openai.audio.transcriptions.create({
      file: whisperFile,
      model: 'whisper-1',
      language: 'es',
    })
    transcripcion = resp.text ?? ''
  } catch (err) {
    console.error('[desembolso-video] Whisper error:', err)
    return NextResponse.json(
      { error: 'No se pudo transcribir el audio del video. Reintenta.' },
      { status: 500 },
    )
  }

  // 3. Frames del video via URL de Cloudinary. Cloudinary genera un
  //    thumbnail JPG desde el video con transformacion so_<segundos>.
  //    Con 3 frames alcanzamos: al inicio (2s), a la mitad (~5-7s) y
  //    hacia el final (~12s). Si el video es corto la extraccion
  //    igual funciona porque Cloudinary hace clamp.
  const framesUrls = [2, 6, 12].map((s) =>
    cloudinary.url(uploadResult.public_id, {
      resource_type: 'video',
      format: 'jpg',
      transformation: [{ start_offset: `${s}` }, { width: 640, crop: 'limit' }],
    }),
  )

  // 4. Claude Vision decide si hay dinero visible.
  let dineroVisible = false
  let dineroDetalle = ''
  try {
    const framesContent = await Promise.all(
      framesUrls.map(async (u) => {
        const r = await fetch(u)
        if (!r.ok) throw new Error(`Frame fetch failed: ${u}`)
        const arr = new Uint8Array(await r.arrayBuffer())
        return Buffer.from(arr).toString('base64')
      }),
    )
    const visionResp = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-latest',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: [
            ...framesContent.map((b64) => ({
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: 'image/jpeg' as const,
                data: b64,
              },
            })),
            {
              type: 'text' as const,
              text: 'Estas imagenes son frames de un video donde alguien recibe dinero en efectivo. ¿En alguna de las imagenes se ve claramente dinero (billetes de peso mexicano) siendo mostrado por la persona? Responde SOLO en JSON con esta forma exacta: {"dinero_visible": true|false, "explicacion": "breve razon"}.',
            },
          ],
        },
      ],
    })
    const textBlock = visionResp.content.find((b) => b.type === 'text')
    if (textBlock && textBlock.type === 'text') {
      const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { dinero_visible: boolean; explicacion: string }
        dineroVisible = Boolean(parsed.dinero_visible)
        dineroDetalle = parsed.explicacion ?? ''
      }
    }
  } catch (err) {
    console.error('[desembolso-video] Claude Vision error:', err)
    // Si Vision falla, marcamos el check como no verificado y forzamos
    // regrabar — es mas seguro que auto-aprobar sin ver.
    dineroVisible = false
    dineroDetalle = 'Error al analizar el video con visión — reintenta o contacta soporte'
  }

  // 5. Correr los 5 checks
  const hoy = todayMx()
  const rNombre  = checkNombre(transcripcion, loan.client.nombreCompleto)
  const rFecha   = checkFecha(transcripcion, hoy)
  const rMonto   = checkMonto(transcripcion, Number(loan.capital))
  const rPalabra = checkPalabraDelDia(transcripcion, loan.desembolsoPalabraDelDia)
  const rDinero  = { ok: dineroVisible, detalle: dineroDetalle || (dineroVisible ? 'Dinero visible en el video' : 'No se detectó dinero') }

  const validacion = {
    checkedAt: new Date().toISOString(),
    checks: {
      nombre:        rNombre,
      fecha:         rFecha,
      monto:         rMonto,
      palabraDelDia: rPalabra,
      dineroVisible: rDinero,
    },
    transcripcionLength: transcripcion.length,
  }
  const todosOk = rNombre.ok && rFecha.ok && rMonto.ok && rPalabra.ok && rDinero.ok

  // ── Si algún check falla: guardar y regresar razones ─────────────
  if (!todosOk) {
    await prisma.loan.update({
      where: { id: loan.id },
      data: {
        desembolsoTranscripcion: transcripcion,
        desembolsoValidacion:    validacion as unknown as Prisma.InputJsonValue,
        desembolsoAprobado:      false,
        desembolsoIntentos:      { increment: 1 },
        // La palabra del dia se INVALIDA para forzar iniciar una nueva
        // sesion — asi no se puede reusar el nonce en un segundo video.
        desembolsoPalabraDelDia:    null,
        desembolsoSesionIniciadaAt: null,
      },
    })
    createAuditLog({
      userId,
      accion: 'DESEMBOLSO_VIDEO_RECHAZADO',
      tabla: 'Loan',
      registroId: loan.id,
      valoresNuevos: { validacion, videoUrl },
    })
    const razones = [
      !rNombre.ok  && rNombre.detalle,
      !rFecha.ok   && rFecha.detalle,
      !rMonto.ok   && rMonto.detalle,
      !rPalabra.ok && rPalabra.detalle,
      !rDinero.ok  && rDinero.detalle,
    ].filter(Boolean) as string[]
    return NextResponse.json({
      aprobado: false,
      videoUrl,
      validacion,
      razones,
      message: 'El video no pasó todos los checks. Vuelve a intentar con una nueva sesión.',
    }, { status: 200 })
  }

  // ── Todos los checks pasaron: activar el préstamo ────────────────
  // Reutilizamos la misma lógica que disbursement-photo, incluyendo
  // propagación grupal SOLIDARIO cuando el loan es la coordinadora.

  // Cargamos el loan completo para tener todos los campos que la
  // activación necesita (schedule genera fechas, etc.). El findFirst
  // inicial solo tenía select limitado.
  const loanFull = await prisma.loan.findUnique({ where: { id: loan.id } })
  if (!loanFull) return NextResponse.json({ error: 'Préstamo no encontrado en 2do fetch' }, { status: 404 })

  let targetLoans: Array<typeof loanFull> = [loanFull]
  let activacionGrupal = false
  if (esFlujoNuevo && loanFull.tipo === 'SOLIDARIO' && loanFull.loanGroupId) {
    const esRenovacion = loanFull.loanOriginalId !== null
    const cicloFilter = esRenovacion ? { loanOriginalId: { not: null } } : { loanOriginalId: null }
    if (loanFull.esCoordinadora) {
      const integrantes = await prisma.loan.findMany({
        where: { loanGroupId: loanFull.loanGroupId, estado: 'IN_ACTIVATION', ...cicloFilter, companyId: companyId! },
      })
      if (integrantes.length > 0) {
        targetLoans = integrantes
        activacionGrupal = integrantes.length > 1
      }
    } else {
      const coord = await prisma.loan.findFirst({
        where: { loanGroupId: loanFull.loanGroupId, esCoordinadora: true, ...cicloFilter, companyId: companyId! },
        include: { client: { select: { nombreCompleto: true } } },
      })
      if (coord) {
        return NextResponse.json({
          error: 'ACTIVAR_DESDE_COORDINADORA',
          message: `Este préstamo se activa con todo el grupo desde el perfil de la coordinadora: ${coord.client.nombreCompleto}.`,
          coordinadoraLoanId: coord.id,
        }, { status: 400 })
      }
    }
  }

  // Candados 1 y 2 en flujo nuevo
  if (esFlujoNuevo) {
    for (const t of targetLoans) {
      const contract = await prisma.contract.findFirst({
        where: {
          companyId: companyId!,
          loanDocumentFirmadoId: { not: null },
          OR: [{ loanId: t.id }, { groupMembers: { some: { loanId: t.id } } }],
        },
        select: { id: true },
      })
      if (!contract) {
        return NextResponse.json({ error: `Falta el contrato firmado (candado 1)${activacionGrupal ? ` para ${t.id}` : ''}` }, { status: 400 })
      }
      if (t.seguroMetodoPago === null || t.seguroPendiente) {
        return NextResponse.json({ error: 'Falta el pago de comisión / seguro (candado 2)' }, { status: 400 })
      }
    }
  }

  const parsedLat = lat ? parseFloat(lat) : null
  const parsedLng = lng ? parseFloat(lng) : null
  const now = new Date()

  await prisma.$transaction(async (tx) => {
    for (const t of targetLoans) {
      // Legacy: solo guardar video
      if (esLegacyActivePendiente && t.id === loan.id) {
        await tx.loan.update({
          where: { id: t.id },
          data: {
            desembolsoVideoUrl:      videoUrl,
            desembolsoLat:           parsedLat,
            desembolsoLng:           parsedLng,
            desembolsoVideoSubidoAt: now,
            desembolsoTranscripcion: transcripcion,
            desembolsoValidacion:    validacion as unknown as Prisma.InputJsonValue,
            desembolsoAprobado:      true,
            desembolsoIntentos:      { increment: 1 },
          },
        })
        continue
      }
      // Flujo nuevo: activar
      const fechaDesembolso = t.fechaDesembolso ?? todayMx()
      const fechaPrimerPagoRef = t.fechaPrimerPago ?? null
      const plazo = Number(t.plazo)
      let fechas: Date[]
      if (t.tipo === 'AGIL') {
        fechas = fechaPrimerPagoRef
          ? generarFechasHabilesDesde(fechaPrimerPagoRef, plazo)
          : generarFechasHabiles(fechaDesembolso, plazo)
      } else if (t.tipo === 'FIDUCIARIO') {
        fechas = generarFechasFiduciario(fechaDesembolso, plazo)
      } else {
        fechas = fechaPrimerPagoRef
          ? generarFechasSemanalesDesde(fechaPrimerPagoRef, plazo)
          : generarFechasSemanales(fechaDesembolso, plazo)
      }
      const montoPorPago =
        t.tipo === 'AGIL'       ? Number(t.pagoDiario) :
        t.tipo === 'FIDUCIARIO' ? Number(t.pagoQuincenal) :
                                  Number(t.pagoSemanal)

      // Solo el loan donde el coord subio el video guarda video/GPS;
      // los demas del grupo se activan pero conservan sus campos de
      // desembolso propios (foto/GPS individual si aplicara).
      const dataUpdate: Prisma.LoanUpdateInput = {
        estado: 'ACTIVE',
        fechaDesembolso,
      }
      if (t.id === loan.id) {
        dataUpdate.desembolsoVideoUrl      = videoUrl
        dataUpdate.desembolsoLat           = parsedLat
        dataUpdate.desembolsoLng           = parsedLng
        dataUpdate.desembolsoVideoSubidoAt = now
        dataUpdate.desembolsoTranscripcion = transcripcion
        dataUpdate.desembolsoValidacion    = validacion as unknown as Prisma.InputJsonValue
        dataUpdate.desembolsoAprobado      = true
        dataUpdate.desembolsoIntentos      = { increment: 1 }
      }
      await tx.loan.update({ where: { id: t.id }, data: dataUpdate })

      const scheduleData = fechas.map((fecha, idx) => ({
        loanId: t.id,
        numeroPago: idx + 1,
        fechaVencimiento: fecha,
        montoEsperado: montoPorPago,
        estado: 'PENDING' as const,
      } satisfies Prisma.PaymentScheduleCreateManyInput))
      await tx.paymentSchedule.createMany({ data: scheduleData })

      // Renovación → liquidar crédito original
      if (t.loanOriginalId) {
        const idsFinanciados = Array.isArray(t.pagosFinanciadosIds)
          ? (t.pagosFinanciadosIds as string[])
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
            loanId: t.loanOriginalId,
            estado: { in: ['PENDING', 'OVERDUE', 'PARTIAL'] },
            ...(idsFinanciados?.length ? { id: { notIn: idsFinanciados } } : {}),
          },
          data: { estado: 'FINANCIADO', pagadoAt: pagadoAtMx },
        })
        await tx.loan.update({ where: { id: t.loanOriginalId }, data: { estado: 'LIQUIDATED' } })
      }
    }
  })

  createAuditLog({
    userId,
    accion: activacionGrupal ? 'ACTIVATE_GROUP_VIA_DISBURSEMENT_VIDEO' : 'ACTIVATE_LOAN_VIA_DISBURSEMENT_VIDEO',
    tabla: 'Loan',
    registroId: loan.id,
    valoresNuevos: {
      videoUrl, validacion, lat: parsedLat, lng: parsedLng, estado: 'ACTIVE',
      ...(activacionGrupal ? { integrantesActivados: targetLoans.map((t) => t.id) } : {}),
    },
  })

  // Notificaciones (best-effort)
  try {
    const directores = await getDirectoresIds(prisma, companyId!)
    const clienteRow = await prisma.client.findUnique({ where: { id: loan.clientId }, select: { nombreCompleto: true } })
    const cobradorRow = await prisma.user.findUnique({ where: { id: loan.cobradorId }, select: { nombre: true } })
    const clienteNombre = clienteRow?.nombreCompleto ?? 'cliente'
    const cobradorNombre = cobradorRow?.nombre ?? 'cobradora'
    await crearNotificacion(prisma, {
      companyId: companyId!,
      destinatariosIds: directores,
      tipo: 'PRESTAMO_ACTIVADO',
      nivel: 'INFORMATIVA',
      titulo: activacionGrupal
        ? `Grupo solidario activado por video — ${targetLoans.length} integrantes`
        : 'Préstamo activado por video de desembolso',
      mensaje: `${clienteNombre} — Cobradora: ${cobradorNombre}`,
      loanId: loan.id,
      clientId: loan.clientId,
    })
  } catch (e) {
    console.error('[desembolso-video] notif failed:', e)
  }

  return NextResponse.json({
    aprobado: true,
    videoUrl,
    validacion,
    activacionGrupal,
    message: activacionGrupal
      ? `Grupo activado — ${targetLoans.length} integrantes`
      : 'Préstamo activado con video de desembolso',
  })
}
