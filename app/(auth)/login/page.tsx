import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { encode } from 'next-auth/jwt'
import { cookies } from 'next/headers'
import { PasswordInput } from './PasswordInput'

const SECRET = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? ''
const COOKIE_NAME = 'authjs.session-token'

async function loginAction(formData: FormData) {
  'use server'
  const email = (formData.get('email') as string | null)?.trim() ?? ''
  const password = (formData.get('password') as string | null) ?? ''

  if (!email || !password) redirect('/login?error=invalid')

  try {
    const user = await prisma.user.findFirst({
      where: { email, activo: true },
      include: { company: { include: { license: true } } },
    })
    if (!user) redirect('/login?error=invalid')

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) redirect('/login?error=invalid')

    if (user.rol !== 'SUPER_ADMIN') {
      const lic = user.company?.license
      if (!lic || lic.estado === 'CANCELLED') redirect('/login?error=license')
    }

    const token = await encode({
      token: {
        sub:           user.id,
        email:         user.email,
        name:          user.nombre,
        rol:           user.rol,
        companyId:     user.companyId,
        branchId:      user.branchId ?? null,
        zonaBranchIds: null,
      },
      secret: SECRET,
      salt:   COOKIE_NAME,
    })

    prisma.user.update({ where: { id: user.id }, data: { ultimoAcceso: new Date() } }).catch(() => {})

    const cookieStore = cookies()
    cookieStore.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge:   60 * 60 * 24 * 30,
      path:     '/',
    })

    const dest = user.rol === 'SUPER_ADMIN' ? '/sys-mnt-9x7k/panel' : '/dashboard'
    redirect(dest)
  } catch (e: unknown) {
    // Re-throw Next.js redirect errors — they are not real errors
    if (typeof e === 'object' && e !== null && 'digest' in e) throw e
    console.error('[LOGIN ERROR]', e)
    redirect('/login?error=server')
  }
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const errorMsg =
    searchParams.error === 'invalid'
      ? 'Credenciales incorrectas. Verifica tu email y contraseña.'
      : searchParams.error === 'license'
      ? 'Tu empresa no tiene licencia activa.'
      : searchParams.error === 'server'
      ? 'Error del servidor. Contacta al administrador.'
      : null

  return (
    /* Glass-morphism card */
    <div
      className="w-full rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
      style={{
        background:   'rgba(14, 18, 38, 0.75)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      {/* Top accent bar */}
      <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, #1a6fff, #00c6ff)' }} />

      <div className="p-8">
        {/* Logo + title */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div
            className="rounded-2xl p-3.5"
            style={{ background: 'linear-gradient(135deg, #1a5fff, #0099ff)' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24"
              fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/>
              <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>
              <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/>
              <path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white tracking-wide">MicroKapital</h1>
            <p className="text-sm text-blue-300/80 mt-0.5">Sistema de Gestión de Microfinanzas</p>
          </div>
        </div>

        {/* Form */}
        <form action={loginAction} encType="multipart/form-data" className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-xs font-semibold text-blue-200/70 uppercase tracking-wider">
              Correo electrónico
            </label>
            <input
              id="email" name="email" type="email"
              placeholder="tu@empresa.com"
              required autoComplete="email"
              className="w-full rounded-xl border border-white/10 px-4 py-3 text-sm text-white placeholder-white/25
                         focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-blue-500/40 transition-all"
              style={{ background: 'rgba(255,255,255,0.07)' }}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-xs font-semibold text-blue-200/70 uppercase tracking-wider">
              Contraseña
            </label>
            <PasswordInput />
          </div>

          {errorMsg && (
            <div className="rounded-xl border border-red-500/30 px-4 py-3 text-sm text-red-300"
              style={{ background: 'rgba(239,68,68,0.12)' }}>
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-all duration-200
                       hover:opacity-90 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            style={{ background: 'linear-gradient(135deg, #1a5fff, #0099ff)' }}
          >
            Iniciar sesión
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-white/25">
          Sistema de uso exclusivo para personal autorizado
        </p>
      </div>
    </div>
  )
}
