import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

const PUBLIC_PATHS = [
  '/login',
  '/api/auth',
  '/api/internal',
  // Endpoints de cron: Vercel Cron nativo bypassea middleware vía
  // configuración de vercel.json, pero servicios externos (cron-job.org,
  // UptimeRobot, EasyCron) no — y el middleware los redirigía a /login
  // con 307. Cada endpoint bajo /api/cron valida INTERNAMENTE la
  // autenticación por x-vercel-cron o Authorization: Bearer CRON_SECRET,
  // así que es seguro saltar el middleware aquí.
  '/api/cron',
  '/licencia-suspendida',
  '/verificar',
  // Rutas públicas de preview + PWA — crawlers (WhatsApp/Facebook) y el
  // browser al registrar la app instalable las piden sin cookies. Si el
  // middleware las redirige al /login el preview no carga y el PWA no
  // se instala.
  '/opengraph-image',
  '/twitter-image',
  '/sw.js',
  '/manifest.webmanifest',
  '/pwa-icon',   // cubre /pwa-icon-192.png, /pwa-icon-512.png, maskable
  '/apple-icon', // apple-icon.png e índices (apple-icon-0, -1, ...)
]

const SUPER_ADMIN_PATH = '/sys-mnt-9x7k'
const CLIENT_PORTAL_PATHS = ['/mi-cuenta', '/mis-pagos', '/mis-documentos']

// Modo mantenimiento: cuando la env var MAINTENANCE_MODE === 'true', toda
// la app (incluyendo /login) se rewrite a /mantenimiento. La URL del
// browser se conserva pero el contenido es la pantalla de candado.
// Para desactivar: quitar/setear false la env var en Vercel y redeployar.
const MAINTENANCE_ALLOWED_PATHS = [
  '/mantenimiento',
  '/_next',
  '/favicon',
]
const MAINTENANCE_ALLOWED_EXTENSIONS = /\.(png|svg|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot)$/i

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // 0. Modo mantenimiento — corta antes que cualquier otra lógica.
  if (process.env.MAINTENANCE_MODE === 'true') {
    const allowed =
      MAINTENANCE_ALLOWED_PATHS.some((p) => pathname.startsWith(p)) ||
      MAINTENANCE_ALLOWED_EXTENSIONS.test(pathname)
    if (!allowed) {
      return NextResponse.rewrite(new URL('/mantenimiento', req.url))
    }
    return NextResponse.next()
  }

  // 1. Rutas públicas → pasar.
  //    "/" se compara exacto para no bloquear al RootPage: ese server
  //    component decide si redirigir al dashboard (con sesión) o
  //    renderizar el landing comercial público (sin sesión).
  if (pathname === '/' || PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // 2. Obtener sesión desde JWT
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
  const token = await getToken({ req, secret, salt: 'authjs.session-token' })

  if (!token) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  const rol = token.rol as string
  const companyId = token.companyId as string | null

  // 3. Ruta del super admin → solo SUPER_ADMIN
  if (pathname.startsWith(SUPER_ADMIN_PATH)) {
    if (rol !== 'SUPER_ADMIN') {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
    return NextResponse.next()
  }

  // 4. SUPER_ADMIN fuera de su panel → redirigir
  if (rol === 'SUPER_ADMIN') {
    return NextResponse.redirect(new URL(`${SUPER_ADMIN_PATH}/panel`, req.url))
  }

  // 5. Portal del cliente
  const isClientPortal = CLIENT_PORTAL_PATHS.some((p) => pathname.startsWith(p))
  if (isClientPortal && rol !== 'CLIENTE') {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }
  if (!isClientPortal && rol === 'CLIENTE' && !pathname.startsWith('/api')) {
    return NextResponse.redirect(new URL('/mi-cuenta', req.url))
  }

  // 6. Sin companyId → error
  if (!companyId && rol !== 'SUPER_ADMIN') {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // 7. Propagar el pathname al server component via REQUEST header para
  //    que el DashboardLayout pueda exentar ciertas rutas del bloqueo
  //    de corte pendiente (p.ej. /caja y /cortes/recibidos — para que
  //    el user pueda imprimir ticket y aceptar cortes recibidos aun
  //    con su propio corte pendiente de entregar).
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-pathname', pathname)
  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$|.*\\.jpg$|.*\\.jpeg$|.*\\.gif$|.*\\.webp$).*)',
  ],
}
