import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { v2 as cloudinary } from 'cloudinary'
import { SESION_DESEMBOLSO_TTL_MS } from '@/lib/desembolso-video'

// Excepcion unica del 2026-09-22 — el flujo de IA fallo el dia
// anterior y varios prestamos se grabaron offline. Se acepta upload
// manual sin validacion IA hasta las 00:00 CST del 2026-09-23.
// Despues del deadline los intentos con `manual: true` se rechazan.
const BYPASS_MANUAL_EXPIRA_MS = new Date('2026-09-23T06:00:00Z').getTime()

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

/**
 * POST /api/loans/[id]/desembolso/signature
 *
 * Genera una firma de Cloudinary para que el frontend suba el video
 * DIRECTO a Cloudinary sin pasar por Vercel — asi sorteamos el limite
 * de 4.5 MB por request que revienta el flow original con videos
 * comunes de movil (que suelen ignorar los hints de bitrate).
 *
 * Devuelve todos los parametros que Cloudinary necesita en el POST
 * unico al endpoint /v1_1/<cloud>/video/upload: apiKey, timestamp,
 * folder, publicId y signature. La signature esta atada a esos
 * parametros exactos: si el frontend intenta cambiar algo, Cloudinary
 * rechaza.
 *
 * Permisos: mismo que iniciar-sesion (dueños del prestamo + SA).
 * Prerequisito: sesion desembolso ya iniciada (palabra del dia activa).
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
      id: true, cobradorId: true, branchId: true,
      desembolsoPalabraDelDia: true,
      desembolsoSesionIniciadaAt: true,
    },
  })
  if (!loan) return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })

  let allowed = false
  if (rol === 'SUPER_ADMIN') allowed = true
  else if (rol === 'COORDINADOR' || rol === 'GERENTE') allowed = loan.cobradorId === userId
  else if (rol === 'GERENTE_ZONAL') {
    const zoneIds = session.user.zonaBranchIds
    allowed = (Array.isArray(zoneIds) && zoneIds.includes(loan.branchId)) || loan.cobradorId === userId
  }
  if (!allowed) return NextResponse.json({ error: 'Sin permisos sobre este préstamo' }, { status: 403 })

  // Bypass de excepcion (solo hoy 2026-09-22). Si el cliente manda
  // `manual: true` en el body, saltamos la validacion de sesion — no
  // hay palabra del dia porque el video se grabo ayer offline. Se
  // usa junto con /upload en modo bypass. Despues del deadline
  // rechazamos con 400 (el flag deja de funcionar solo).
  const body = await req.json().catch(() => ({})) as { manual?: boolean }
  const modoManual = body.manual === true
  if (modoManual) {
    if (Date.now() > BYPASS_MANUAL_EXPIRA_MS) {
      return NextResponse.json(
        { error: 'La excepción de video manual expiró. Usa el flujo normal con validación automática.' },
        { status: 400 },
      )
    }
  } else {
    // Modo normal: sesion debe existir y estar viva
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

  const timestamp = Math.floor(Date.now() / 1000)
  const folder = 'microkapital/desembolsos-video'
  const publicId = `${loan.id}-${timestamp}`

  // Solo se firman los parametros que el frontend enviara — no
  // incluir resource_type ni file, esos van en la URL / no aplican.
  const signature = cloudinary.utils.api_sign_request(
    { folder, public_id: publicId, timestamp },
    process.env.CLOUDINARY_API_SECRET!,
  )

  return NextResponse.json({
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey:    process.env.CLOUDINARY_API_KEY,
    timestamp,
    folder,
    publicId,
    signature,
  })
}
