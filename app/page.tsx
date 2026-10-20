import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { HeroCarousel } from '@/components/landing/HeroCarousel'

/**
 * Página pública raíz.
 *
 *   - Con sesión → redirige al panel según el rol (igual que antes).
 *   - Sin sesión → renderiza el landing comercial de MicroKapital.
 *
 * El middleware deja pasar "/" como ruta pública para no bloquear al
 * visitante anónimo. El resto de rutas sigue protegido como siempre.
 */
export default async function RootPage() {
  const session = await auth()

  if (session?.user) {
    if (session.user.rol === 'SUPER_ADMIN') redirect('/sys-mnt-9x7k/panel')
    if (session.user.rol === 'CLIENTE')     redirect('/mi-cuenta')
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-[#0b0a1a] text-white antialiased">
      {/* NAVBAR */}
      <nav className="sticky top-0 z-20 backdrop-blur bg-[#0b0a1a]/80 border-b border-white/5">
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <span
              className="text-3xl font-black italic text-fuchsia-500 leading-none"
              style={{ fontFamily: 'var(--font-permanent-marker), Marker Felt, cursive', transform: 'rotate(-4deg)' }}
              aria-label="MicroKapital"
            >
              Mk
            </span>
            <span className="font-semibold tracking-tight">MicroKapital</span>
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-1.5 rounded-full bg-fuchsia-500 text-white hover:bg-fuchsia-400 transition"
          >
            Entrar →
          </Link>
        </div>
      </nav>

      {/* HERO = CARRUSEL */}
      <HeroCarousel />

      {/* CTA FINAL */}
      <section className="max-w-6xl mx-auto px-5 py-16">
        <div
          className="rounded-3xl p-8 sm:p-12 text-center overflow-hidden relative"
          style={{
            background: `
              radial-gradient(60% 100% at 20% 0%,rgba(236,72,153,.5),transparent 60%),
              radial-gradient(60% 100% at 100% 100%,rgba(14,165,233,.5),transparent 60%),
              linear-gradient(120deg,#1e1b3a,#171530)
            `,
          }}
        >
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight max-w-xl mx-auto text-balance">
            Lista para dar tu siguiente paso
          </h2>
          <p className="text-white/70 mt-3 max-w-md mx-auto">
            Acércate con tu coordinadora o visita cualquiera de nuestras sucursales
            para conocer el crédito que te queda mejor.
          </p>
          <div className="flex flex-wrap gap-3 justify-center mt-6">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white text-pink-600 font-semibold hover:bg-white/95 transition"
            >
              Soy cliente — Entrar
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/5">
        <div className="max-w-6xl mx-auto px-5 py-8 flex flex-col sm:flex-row items-center gap-3 justify-between text-xs text-white/55">
          <div className="flex items-center gap-2">
            <span
              className="text-xl font-black italic text-fuchsia-500 leading-none"
              style={{ fontFamily: 'var(--font-permanent-marker), cursive', transform: 'rotate(-4deg)' }}
            >
              Mk
            </span>
            <span>© {new Date().getFullYear()} MicroKapital Financiera · Todos los derechos reservados.</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="hover:text-white transition">
              Soy cliente
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
