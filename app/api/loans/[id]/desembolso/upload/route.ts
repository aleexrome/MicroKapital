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
  checkNombre, checkPalabraDelDia, checkFecha, checkMonto, checkGrupo,
} from '@/lib/desembolso-video-checks'
import OpenAI, { toFile } from 'openai'
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

// Lazy singletons — el SDK de OpenAI v7 valida la key en el constructor,
// y Vercel corre "Collecting page data" en build donde las env vars de
// runtime no siempre estan cargadas. Instanciar dentro del handler evita
// que el build reviente por falta de credenciales.
//
// Ademas, si la env var falta en runtime tiramos un error explicito con
// nombre de la variable — el error nativo del SDK es criptico
// ("Missing credentials. Please pass an 'apikey'...") y hace pensar
// que el bug esta en el codigo cuando en realidad lo que hay que
// hacer es setearla en Vercel > Settings > Environment Variables.
let _openai: OpenAI | null = null
function getOpenAI(): OpenAI {
  if (!_openai) {
    const key = process.env.OPENAI_API_KEY
    if (!key) {
      throw new Error('Falta OPENAI_API_KEY en las variables de entorno del server (Vercel > Settings > Environment Variables). Contacta a soporte para configurarla.')
    }
    _openai = new OpenAI({ apiKey: key })
  }
  return _openai
}
let _anthropic: Anthropic | null = null
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    const key = process.env.ANTHROPIC_API_KEY
    if (!key) {
      throw new Error('Falta ANTHROPIC_API_KEY en las variables de entorno del server (Vercel > Settings > Environment Variables). Contacta a soporte para configurarla.')
    }
    // Si la key es org-level ("All workspaces"), la API exige el
    // header `anthropic-workspace-id`. Con este env var opcional se
    // permite usar keys de ese scope sin regenerarlas — se ignora si
    // la key ya viene scoped a un workspace.
    const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID
    _anthropic = new Anthropic({
      apiKey: key,
      ...(workspaceId ? { defaultHeaders: { 'anthropic-workspace-id': workspaceId } } : {}),
    })
  }
  return _anthropic
}

// Helper para descargar recursos de Cloudinary con reintentos.
// Se usa tanto para el video original como para el derivado MP3.
// Cloudinary responde 423 (Locked) o 404 mientras genera un derivado
// on-demand — con reintentos + backoff cubrimos la ventana de 3-5s
// que a veces toma la generacion. Devuelve un Buffer con los bytes.
async function fetchConReintentos(
  url: string,
  intentos = 3,
  delayMs = 1500,
): Promise<Buffer> {
  let ultimoStatus = 0
  let ultimoMensaje = ''
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(url)
      if (r.ok) {
        return Buffer.from(await r.arrayBuffer())
      }
      ultimoStatus = r.status
      // 423 = generando derivado; 404 = aun no propagado. Reintentar.
      // Cualquier otro status es error terminal.
      if (r.status !== 404 && r.status !== 423) {
        throw new Error(`Cloudinary fetch failed: ${r.status}`)
      }
    } catch (e) {
      ultimoMensaje = e instanceof Error ? e.message : String(e)
    }
    await new Promise((r) => setTimeout(r, delayMs))
  }
  throw new Error(
    `Timeout descargando de Cloudinary (status=${ultimoStatus} msg=${ultimoMensaje} url=${url})`,
  )
}

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
    include: {
      client: { select: { nombreCompleto: true } },
      loanGroup: { select: { nombre: true } },
    },
  })
  if (!loan) return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })

  // ── Reglas grupales (SOLIDARIO) ──────────────────────────────────
  // Las no-coordinadoras no graban su propio video — se activan cuando
  // el video de la coord aprueba. Bloqueamos aqui antes de aceptar la
  // carga (mismo check que /iniciar-sesion).
  const esGrupal = loan.tipo === 'SOLIDARIO' && loan.loanGroupId !== null
  // `esCoordGrupal` se usa despues en varios puntos (Vision prompt,
  // regla de aprobacion flexible, mensajes de rechazo). Lo computamos
  // aqui una sola vez para que este visible en todo el handler.
  const esCoordGrupal = esGrupal && loan.esCoordinadora === true
  if (esGrupal && !loan.esCoordinadora) {
    const esRenovacion = loan.loanOriginalId !== null
    const cicloFilter = esRenovacion ? { loanOriginalId: { not: null } } : { loanOriginalId: null }
    const coord = await prisma.loan.findFirst({
      where: { loanGroupId: loan.loanGroupId!, esCoordinadora: true, ...cicloFilter, companyId: companyId! },
      select: { id: true, client: { select: { nombreCompleto: true } } },
    })
    return NextResponse.json({
      error: 'ACTIVAR_DESDE_COORDINADORA',
      message: coord
        ? `Este préstamo se activa con todo el grupo desde el perfil de la coordinadora: ${coord.client.nombreCompleto}.`
        : 'Este préstamo forma parte de un grupo solidario y se activa desde el perfil de la coordinadora.',
      coordinadoraLoanId: coord?.id ?? null,
    }, { status: 400 })
  }

  // Permisos por rol
  let allowed = false
  if (rol === 'SUPER_ADMIN') allowed = true
  else if (rol === 'COORDINADOR' || rol === 'GERENTE') allowed = loan.cobradorId === userId
  else if (rol === 'GERENTE_ZONAL') {
    const zoneIds = session.user.zonaBranchIds
    allowed = (Array.isArray(zoneIds) && zoneIds.includes(loan.branchId)) || loan.cobradorId === userId
  }
  if (!allowed) return NextResponse.json({ error: 'Sin permisos sobre este préstamo' }, { status: 403 })

  // ── Recibir body primero (incluye flag opcional `manual` para bypass) ──
  const body = await req.json().catch(() => null) as
    | {
        videoUrl?: string
        publicId?: string
        lat?: string | number | null
        lng?: string | number | null
        /** Bypass de IA (excepcion unica del 2026-09-22). */
        manual?: boolean
      }
    | null
  if (!body?.videoUrl || !body?.publicId) {
    return NextResponse.json(
      { error: 'Faltan videoUrl y publicId. Sube primero el video a Cloudinary con la firma de /signature.' },
      { status: 400 },
    )
  }

  // Bypass de excepcion (2026-09-22). Deadline duro server-side: si
  // hoy es despues del corte, `manual: true` se ignora y volvemos al
  // flujo normal (que rechazara por falta de sesion). Auditamos aparte.
  const BYPASS_MANUAL_EXPIRA_MS = new Date('2026-09-23T06:00:00Z').getTime()
  const bypassSolicitado = body.manual === true
  const bypassPermitido = bypassSolicitado && Date.now() <= BYPASS_MANUAL_EXPIRA_MS
  if (bypassSolicitado && !bypassPermitido) {
    return NextResponse.json(
      { error: 'La excepción de video manual expiró. Vuelve al flujo normal con validación automática.' },
      { status: 400 },
    )
  }

  // Sesion debe existir y estar viva — SOLO en modo normal. En modo
  // manual saltamos: no hay palabra del dia porque el video se grabo
  // offline antes de este endpoint.
  if (!bypassPermitido) {
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
  }

  const esFlujoNuevo = loan.estado === 'IN_ACTIVATION'
  const esLegacyActivePendiente = loan.estado === 'ACTIVE' && !loan.desembolsoVideoUrl
  if (!esFlujoNuevo && !esLegacyActivePendiente) {
    return NextResponse.json(
      { error: 'El préstamo no está en flujo de desembolso o ya tiene video aprobado' },
      { status: 400 },
    )
  }

  // ── Candados 1 y 2 (validacion temprana) ──────────────────────────
  // Antes esta validacion vivia solo despues de que Whisper y Claude
  // Vision aprobaban el video — desperdicio de recursos. Ahora se
  // corre aqui, antes de descargar/transcribir/analizar. Si algun
  // candado falta, ni siquiera se toca a Cloudinary ni a las APIs.
  if (esFlujoNuevo) {
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

  // El body ya lo parseamos arriba (para leer el flag `manual`).
  // Aqui solo extraemos las referencias al video ya subido a
  // Cloudinary + GPS opcional.
  const videoUrl = body.videoUrl
  const publicId = body.publicId
  const lat = body.lat != null ? String(body.lat) : null
  const lng = body.lng != null ? String(body.lng) : null

  // ── Bypass: si `manual` esta activo y valido, saltamos toda la
  // pipeline de IA (Whisper + Vision + checks) y vamos directo a
  // activar. Esto es la excepcion del 2026-09-22 para desembolsos
  // grabados offline. Un audit log despues marca claramente que fue
  // manual con el user + timestamp.
  let transcripcion = ''
  let validacion: {
    checkedAt: string
    checks: Record<string, { ok: boolean; detalle: string }>
    transcripcionLength?: number
    bypass?: boolean
  }
  let todosOk = false

  if (bypassPermitido) {
    // Validacion "sintetica" para poblar los mismos campos que el
    // flujo normal — asi la UI de auditoria muestra este video como
    // aprobado con la nota "bypass manual".
    transcripcion = '[bypass manual — video no transcrito, excepcion del 2026-09-22]'
    validacion = {
      checkedAt: new Date().toISOString(),
      checks: {
        nombre:        { ok: true, detalle: 'Bypass manual (excepción del 2026-09-22)' },
        fecha:         { ok: true, detalle: 'Bypass manual (excepción del 2026-09-22)' },
        monto:         { ok: true, detalle: 'Bypass manual (excepción del 2026-09-22)' },
        palabraDelDia: { ok: true, detalle: 'Bypass manual (excepción del 2026-09-22)' },
        dineroVisible: { ok: true, detalle: 'Bypass manual (excepción del 2026-09-22)' },
      },
      bypass: true,
    }
    todosOk = true
  } else {

  // 1. Descargar el video desde Cloudinary y pasarlo a Whisper.
  //    Estrategia con doble intento:
  //     (a) primer intento con el video ORIGINAL — Whisper sabe extraer
  //         audio de webm/mp4/m4a directamente, es el camino rapido.
  //     (b) si (a) falla (algunos webm de MediaRecorder tienen headers
  //         no estandar que revientan el decoder de Whisper), pedimos
  //         a Cloudinary un derivado de solo audio (mp3) y reintentamos.
  //    Antes intentabamos solo (a) y por eso a veces salia "no se pudo
  //    transcribir". Ahora si (a) falla, el fallback (b) suele arreglar.
  //
  //    Nota critica: se usa `toFile` de OpenAI SDK — NO `new File(...)`.
  //    El File nativo de Node no siempre es reconocido por el
  //    Uploadable de OpenAI v7, lo que causa que el SDK falle con
  //    "expected file-like value" o mande el body mal. `toFile` arma
  //    el multipart correcto en todos los runtimes.
  const debugTrace: string[] = []
  try {
    const videoBuf = await fetchConReintentos(videoUrl)
    debugTrace.push(`original bytes=${videoBuf.byteLength}`)

    // Elegimos extension segun el URL. Si Cloudinary reescribio o le
    // dimos mal la pista, el fallback igual cubre.
    const ext = videoUrl.toLowerCase().endsWith('.mp4') ? 'mp4' : 'webm'
    const type = ext === 'mp4' ? 'video/mp4' : 'video/webm'

    try {
      const primaryFile = await toFile(
        new Uint8Array(videoBuf),
        `desembolso-${loan.id}.${ext}`,
        { type },
      )
      const resp = await getOpenAI().audio.transcriptions.create({
        file: primaryFile,
        model: 'whisper-1',
        language: 'es',
      })
      transcripcion = resp.text ?? ''
      debugTrace.push(`whisper-primary ok len=${transcripcion.length}`)
    } catch (primaryErr) {
      debugTrace.push(
        `whisper-primary FAIL: ${primaryErr instanceof Error ? primaryErr.message : String(primaryErr)}`,
      )
      // Fallback: pedir a Cloudinary un derivado de solo audio (mp3).
      // La transformacion `f_mp3` genera el derivado en la primera
      // peticion; puede tardar 1-3s. fetchConReintentos cubre el 423
      // "processing" de Cloudinary.
      const mp3Url = cloudinary.url(publicId, {
        resource_type: 'video',
        format: 'mp3',
      })
      const mp3Buf = await fetchConReintentos(mp3Url, 5, 2000)
      debugTrace.push(`mp3 derivate bytes=${mp3Buf.byteLength}`)
      const mp3File = await toFile(
        new Uint8Array(mp3Buf),
        `desembolso-${loan.id}.mp3`,
        { type: 'audio/mpeg' },
      )
      const resp = await getOpenAI().audio.transcriptions.create({
        file: mp3File,
        model: 'whisper-1',
        language: 'es',
      })
      transcripcion = resp.text ?? ''
      debugTrace.push(`whisper-fallback ok len=${transcripcion.length}`)
    }
    console.log('[desembolso-video] trace:', debugTrace.join(' | '))
    console.log('[desembolso-video] transcripcion:', transcripcion.slice(0, 200))
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[desembolso-video] Whisper error:', err, 'trace:', debugTrace)
    return NextResponse.json(
      {
        error: `No se pudo transcribir el audio (${errMsg}). Reintenta; si persiste, contacta soporte.`,
        debug: `${errMsg} — trace: ${debugTrace.join(' | ')}`,
      },
      { status: 500 },
    )
  }

  // Guardia extra: si Whisper devolvio string vacio o casi vacio,
  // significa que no detecto habla — probable audio en silencio, muy
  // bajo o sin microfono. Mejor rechazar aqui con mensaje claro en
  // lugar de dejar que los 5 checks fallen todos con detalle poco
  // util.
  if (transcripcion.trim().length < 5) {
    return NextResponse.json(
      {
        error: 'No se detectó nada de audio. Habla mas fuerte, cerca del microfono, y vuelve a grabar.',
        debug: `transcripcion vacia: "${transcripcion}"`,
      },
      { status: 500 },
    )
  }

  // 2. Frames del video via URL de Cloudinary. Cloudinary genera un
  //    thumbnail JPG desde el video con transformacion so_<segundos>.
  //    Con 3 frames alcanzamos: al inicio (2s), a la mitad (~5-7s) y
  //    hacia el final (~12s). Si el video es corto la extraccion
  //    igual funciona porque Cloudinary hace clamp.
  const framesUrls = [2, 6, 12].map((s) =>
    cloudinary.url(publicId, {
      resource_type: 'video',
      format: 'jpg',
      transformation: [{ start_offset: `${s}` }, { width: 640, crop: 'limit' }],
    }),
  )

  // 3. Claude Vision decide si hay dinero visible.
  //    Los frames JPG que Cloudinary genera on-the-fly desde el video
  //    tardan 1-3s la primera vez que se piden. Los pedimos con
  //    fetchConReintentos para tolerar el 423/404 mientras Cloudinary
  //    genera cada derivado. Ademas propagamos el mensaje real del
  //    error si algo falla (antes se quedaba en un texto generico
  //    "Error al analizar el video con vision" que no dejaba
  //    diagnosticar).
  // El prompt de Vision cambia en grupal: pedimos que verifique que
  // TODAS las integrantes visibles tienen billetes en la mano. En
  // individual sigue siendo el check simple de "hay dinero visible".
  // Alias para claridad — esCoordGrupal ya se computo arriba.
  const esCoordGrupalVision = esCoordGrupal
  let dineroVisible = false
  let dineroDetalle = ''
  try {
    const framesContent: string[] = []
    for (let i = 0; i < framesUrls.length; i++) {
      const buf = await fetchConReintentos(framesUrls[i], 5, 2000)
      framesContent.push(Buffer.from(new Uint8Array(buf)).toString('base64'))
    }

    // Prompt distinto para grupal vs individual. En grupal exigimos:
    //  1. Se ven MÁS DE UNA persona (grupo visible)
    //  2. Cada persona visible tiene billetes en la mano (en al menos
    //     uno de los 3 frames — asi toleramos que en un frame alguna
    //     este ajustando algo o mirando a la camara sin billetes
    //     mostrados justo ahi).
    const promptTextGrupal = 'Estas 3 imagenes son frames de un video de desembolso GRUPAL — un grupo de mujeres recibiendo un prestamo solidario. En estos frames debe aparecer un GRUPO (mas de una persona) donde cada integrante muestra billetes de peso mexicano en la mano. Responde SOLO en JSON con esta forma exacta: {"grupo_visible": true|false, "todas_con_billetes": true|false, "personas_aprox": <numero>, "explicacion": "breve razon"}. "grupo_visible" es true si se ven al menos 2 personas. "todas_con_billetes" es true si TODAS las personas visibles tienen billetes en la mano en al menos uno de los 3 frames (una persona puede estar sin billetes en un frame si en otro se le ven — solo rechazar si alguien claramente NO tiene billetes en ninguno).'
    const promptTextIndividual = 'Estas imagenes son frames de un video donde alguien recibe dinero en efectivo. ¿En alguna de las imagenes se ve claramente dinero (billetes de peso mexicano) siendo mostrado por la persona? Responde SOLO en JSON con esta forma exacta: {"dinero_visible": true|false, "explicacion": "breve razon"}.'

    const visionResp = await getAnthropic().messages.create({
      // claude-3-5-sonnet-latest devolvia 404 porque la alias `-latest`
      // ya no esta accesible en el workspace (Anthropic la deprecio).
      // Usamos el modelo estable actual — claude-opus-5 tiene vision y
      // es la opcion recomendada por Anthropic para tareas de analisis
      // visual con calidad para produccion (anti-fraude).
      model: 'claude-opus-5',
      max_tokens: 300,
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
              text: esCoordGrupalVision ? promptTextGrupal : promptTextIndividual,
            },
          ],
        },
      ],
    })
    const textBlock = visionResp.content.find((b) => b.type === 'text')
    if (textBlock && textBlock.type === 'text') {
      const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        if (esCoordGrupalVision) {
          const parsed = JSON.parse(jsonMatch[0]) as {
            grupo_visible?: boolean
            todas_con_billetes?: boolean
            personas_aprox?: number
            explicacion?: string
          }
          const grupoOk = Boolean(parsed.grupo_visible)
          const billetesOk = Boolean(parsed.todas_con_billetes)
          dineroVisible = grupoOk && billetesOk
          const nPersonas = typeof parsed.personas_aprox === 'number' ? parsed.personas_aprox : null
          const razon = parsed.explicacion ?? ''
          dineroDetalle = dineroVisible
            ? `Grupo visible (${nPersonas ?? '?'} personas) y todas con billetes. ${razon}`.trim()
            : `Falla grupal: ${!grupoOk ? 'no se ve grupo (mínimo 2 personas)' : ''}${!grupoOk && !billetesOk ? ' y ' : ''}${!billetesOk ? 'no todas tienen billetes en la mano' : ''}. ${razon}`.trim()
        } else {
          const parsed = JSON.parse(jsonMatch[0]) as { dinero_visible: boolean; explicacion: string }
          dineroVisible = Boolean(parsed.dinero_visible)
          dineroDetalle = parsed.explicacion ?? ''
        }
      } else {
        dineroDetalle = `Vision respondió sin JSON parseable: "${textBlock.text.slice(0, 100)}"`
      }
    } else {
      dineroDetalle = 'Vision no devolvió bloque de texto — respuesta inesperada'
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[desembolso-video] Claude Vision error:', err)
    // Propagamos el mensaje real al detalle asi el coord ve si es la
    // API key, la generacion de frames o Anthropic mismo lo que falla.
    dineroVisible = false
    dineroDetalle = `Vision falló: ${msg}`
  }

  // 4. Correr los 5 checks. Si es coord de un grupo SOLIDARIO, dos
  //    cambios respecto al flujo individual:
  //      - "nombre" valida el NOMBRE DEL GRUPO (checkGrupo), no el
  //        del cliente coord. El guion grupal dice "somos el grupo
  //        [nombre]" en lugar de "soy [nombre del cliente]".
  //      - "monto" valida la SUMA de capital de todas las integrantes
  //        del ciclo (montoTotalGrupo), no solo el capital de la coord.
  //    Para el resto de flujos (individual, agil, fiduciario) sigue
  //    igual que antes.
  let montoTotalGrupo = Number(loan.capital)
  if (esCoordGrupal) {
    const esRenovacion = loan.loanOriginalId !== null
    const cicloFilter = esRenovacion ? { loanOriginalId: { not: null } } : { loanOriginalId: null }
    const integrantes = await prisma.loan.findMany({
      where: {
        loanGroupId: loan.loanGroupId!,
        estado: 'IN_ACTIVATION',
        ...cicloFilter,
        companyId: companyId!,
      },
      select: { capital: true },
    })
    if (integrantes.length > 0) {
      montoTotalGrupo = integrantes.reduce((acc, l) => acc + Number(l.capital), 0)
    }
  }

  const hoy = todayMx()
  const rNombre = esCoordGrupal && loan.loanGroup?.nombre
    ? checkGrupo(transcripcion, loan.loanGroup.nombre)
    : checkNombre(transcripcion, loan.client.nombreCompleto)
  const rFecha   = checkFecha(transcripcion, hoy)
  // Tolerancia relativa para montos grandes — un grupo puede prestar
  // $50,000 y una diferencia de $50 se vuelve ridicula. Usamos max(50, 1%).
  const tolMonto = Math.max(50, Math.floor(montoTotalGrupo * 0.01))
  const rMonto   = checkMonto(transcripcion, montoTotalGrupo, tolMonto)
  // desembolsoPalabraDelDia se valida arriba (fuera del bypass) — aca
  // es non-null. Usamos non-null assertion para satisfacer TS.
  const rPalabra = checkPalabraDelDia(transcripcion, loan.desembolsoPalabraDelDia!)
  const rDinero  = { ok: dineroVisible, detalle: dineroDetalle || (dineroVisible ? 'Dinero visible en el video' : 'No se detectó dinero') }

  validacion = {
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
  if (esCoordGrupal) {
    // ── Regla flexible para GRUPAL ────────────────────────────────
    // Los videos grupales se graban en la calle con ruido exterior
    // (motos, gente, viento) y Whisper puede perder algunas palabras.
    // Para no rechazar por audio malo cuando la evidencia es real,
    // relajamos la regla:
    //   OBLIGATORIOS (anti-fraude core):
    //     - palabraDelDia: nonce del dia, imposible de pre-grabar
    //     - dineroVisible: Vision confirma grupo + billetes en mano
    //   CORROBORATIVOS (soft — al menos 1 de 3 debe pasar):
    //     - nombreGrupo, fecha, monto
    // Asi si Whisper solo alcanzo a captar el nombre del grupo (o la
    // fecha, o el monto) mas la palabra del dia, y Vision confirma
    // billetes, el video pasa. Los checks fallidos siguen quedando
    // en el audit log — la evidencia forense se conserva.
    const corroborativosOk = [rNombre.ok, rFecha.ok, rMonto.ok].filter(Boolean).length
    todosOk = rPalabra.ok && rDinero.ok && corroborativosOk >= 1
  } else {
    // Individual: seguimos exigiendo los 5. Un cliente grabando en
    // casa/oficina de la cobradora no tiene el problema de ruido
    // exterior — no hay razon para relajar.
    todosOk = rNombre.ok && rFecha.ok && rMonto.ok && rPalabra.ok && rDinero.ok
  }
  } // ── FIN del else (flujo con IA)

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
    // Derivamos razones desde validacion.checks. En el flujo grupal
    // la regla es distinta (solo palabra + dinero + 1-de-3 corrobora),
    // asi que solo mencionamos los checks que realmente causaron el
    // rechazo — no llenamos el mensaje con checks blandos que
    // fallaron pero no eran obligatorios.
    let razones: string[]
    if (esCoordGrupal) {
      const checks = validacion.checks
      const razonesTemp: string[] = []
      if (!checks.palabraDelDia.ok) razonesTemp.push(`❗ ${checks.palabraDelDia.detalle}`)
      if (!checks.dineroVisible.ok) razonesTemp.push(`❗ ${checks.dineroVisible.detalle}`)
      const corroborativos = [checks.nombre, checks.fecha, checks.monto]
      const corroborativosOk = corroborativos.filter((c) => c.ok).length
      if (corroborativosOk === 0) {
        razonesTemp.push(
          '❗ El audio no captó ni el nombre del grupo, ni la fecha, ni el monto. Al menos UNO de estos debe escucharse. Vuelvan a grabar en un lugar con menos ruido.',
        )
        // Detalle diagnostico para cada uno
        corroborativos.forEach((c) => razonesTemp.push(`  · ${c.detalle}`))
      }
      razones = razonesTemp
    } else {
      razones = Object.values(validacion.checks)
        .filter((c) => !c.ok)
        .map((c) => c.detalle)
    }
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

  // Candados 1 y 2 — ya validados arriba para el loan del coord al
  // inicio del handler. Para SOLIDARIO grupal ademas hay que
  // verificar candados en TODOS los integrantes que se van a activar
  // (cada uno tiene su propio contrato firmado y su propio pago de
  // comision). El loan del coord ya paso arriba; los otros los
  // checamos aqui.
  if (esFlujoNuevo && activacionGrupal) {
    for (const t of targetLoans) {
      if (t.id === loan.id) continue // ya validado arriba
      const contract = await prisma.contract.findFirst({
        where: {
          companyId: companyId!,
          loanDocumentFirmadoId: { not: null },
          OR: [{ loanId: t.id }, { groupMembers: { some: { loanId: t.id } } }],
        },
        select: { id: true },
      })
      if (!contract) {
        return NextResponse.json({ error: `Falta el contrato firmado (candado 1) para ${t.id}` }, { status: 400 })
      }
      if (t.seguroMetodoPago === null || t.seguroPendiente) {
        return NextResponse.json({ error: `Falta el pago de comisión / seguro (candado 2) para integrante ${t.id}` }, { status: 400 })
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
    // Marcamos claramente cuando fue bypass manual — asi cuando alguien
    // audite la actividad, distingue estos activados-sin-IA de los
    // normales. Utl para futura investigacion / cumplimiento.
    accion: bypassPermitido
      ? (activacionGrupal ? 'ACTIVATE_GROUP_VIA_DISBURSEMENT_VIDEO_MANUAL' : 'ACTIVATE_LOAN_VIA_DISBURSEMENT_VIDEO_MANUAL')
      : (activacionGrupal ? 'ACTIVATE_GROUP_VIA_DISBURSEMENT_VIDEO' : 'ACTIVATE_LOAN_VIA_DISBURSEMENT_VIDEO'),
    tabla: 'Loan',
    registroId: loan.id,
    valoresNuevos: {
      videoUrl, validacion, lat: parsedLat, lng: parsedLng, estado: 'ACTIVE',
      bypassManual: bypassPermitido,
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
