import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

const PUBLIC_PATHS = [
  '/login',
  '/api/auth',
  '/api/internal',
  '/licencia-suspendida',
  '/verificar',
]

const SUPER_ADMIN_PATH = '/sys-mnt-9x7k'
const CLIENT_PORTAL_PATHS = ['/mi-cuenta', '/mis-pagos', '/mis-documentos']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // 1. Rutas públicas → pasar
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
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

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$|.*\\.jpg$|.*\\.jpeg$|.*\\.gif$|.*\\.webp$).*)',
  ],
}
