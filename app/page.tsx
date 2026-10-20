import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

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

  // ─────────── Landing comercial (visitantes anónimos) ────────────
  // Server component sin JS: carga rápida, SEO limpio, Facebook/WhatsApp
  // crawler lo lee bien.
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
          <div className="flex items-center gap-2">
            <Link
              href="https://wa.me/525226262627?text=Hola%2C+quisiera+información+sobre+un+microcrédito"
              target="_blank"
              rel="noopener"
              className="hidden sm:inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border border-white/15 text-white/90 hover:border-white/40 hover:text-white transition"
            >
              WhatsApp
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-1.5 rounded-full bg-fuchsia-500 text-white hover:bg-fuchsia-400 transition"
            >
              Entrar →
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <header
        className="relative overflow-hidden"
        style={{
          background: `
            radial-gradient(130% 170% at 8% 8%, #ff6ab0 0%, transparent 55%),
            radial-gradient(110% 170% at 95% 95%, #38bdf8 0%, transparent 55%),
            linear-gradient(120deg, #ec4899 0%, #d946ef 35%, #6366f1 65%, #0ea5e9 100%)
          `,
        }}
      >
        <div
          aria-hidden
          className="absolute inset-0 opacity-30 pointer-events-none mix-blend-overlay"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,.08) 1px, transparent 1px)',
            backgroundSize: '3px 3px',
          }}
        />
        <div className="relative max-w-6xl mx-auto px-5 pt-14 pb-20 sm:pt-20 sm:pb-28 grid grid-cols-1 lg:grid-cols-[1.1fr_.9fr] gap-10 items-center">
          <div className="min-w-0 flex flex-col gap-4">
            <span className="self-start text-[11px] font-bold uppercase tracking-[.25em] px-3 py-1 rounded-full border border-white/50 backdrop-blur-sm">
              Financiera · desde 2024
            </span>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.02] tracking-tight text-balance">
              Microcréditos que{' '}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: 'linear-gradient(90deg,#ffd6ea,#bae6fd)' }}
              >
                impulsan
              </span>{' '}
              tu negocio.
            </h1>
            <p className="text-base sm:text-lg text-white/85 max-w-xl">
              Préstamos grupales y personales desde $4,000. Aprobación en 48 horas,
              sin aval, con un acompañamiento real en cada etapa.
            </p>
            <div className="flex flex-wrap gap-3 mt-2">
              <Link
                href="https://wa.me/525226262627?text=Hola%2C+quisiera+información+sobre+un+microcrédito"
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-white text-pink-600 font-semibold hover:bg-white/95 transition shadow-lg shadow-black/20"
              >
                Solicitar crédito por WhatsApp
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-full border border-white/50 text-white font-semibold hover:bg-white/10 transition"
              >
                Soy cliente — Entrar
              </Link>
            </div>
            <div className="flex items-center gap-5 pt-4 text-xs text-white/70">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-white/70" />
                microkapital.com
              </span>
              <span className="hidden sm:flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-white/70" />
                5 sucursales
              </span>
              <span className="hidden sm:flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-white/70" />
                2,000+ créditos entregados
              </span>
            </div>
          </div>

          {/* Mockup del celular */}
          <div className="justify-self-center lg:justify-self-end">
            <div
              className="relative mx-auto"
              style={{ width: 'min(260px, 70vw)', aspectRatio: '9 / 19.5', transform: 'rotate(5deg)' }}
            >
              <div
                className="absolute inset-0 rounded-[2.4rem] p-1.5"
                style={{
                  background: '#0f0d24',
                  border: '3px solid #1a1735',
                  boxShadow: '0 25px 50px rgba(0,0,0,.4), 0 10px 20px rgba(0,0,0,.25), inset 0 0 0 1px rgba(255,255,255,.06)',
                }}
              >
                <div
                  className="absolute top-2.5 left-1/2 -translate-x-1/2 w-16 h-3 rounded-full bg-black z-10"
                />
                <div
                  className="w-full h-full rounded-[1.9rem] overflow-hidden text-white flex flex-col"
                  style={{ background: 'linear-gradient(165deg,#1a1738,#0f0d24)', fontSize: 11 }}
                >
                  <div className="flex justify-between items-center px-4 pt-2 pb-1 text-[10px] font-semibold text-white/90">
                    <span>10:28</span>
                    <div className="flex gap-1">
                      <span className="w-3 h-1 rounded-full bg-white/75" />
                      <span className="w-3 h-1 rounded-full bg-white/75" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-3.5 pt-3 pb-1">
                    <div className="text-[9px] text-white/60">
                      Hola,
                      <br />
                      <b className="text-white text-[11px] font-semibold">Guadalupe</b>
                    </div>
                    <span
                      className="text-pink-500 italic font-black text-2xl leading-none"
                      style={{ fontFamily: 'var(--font-permanent-marker), cursive', transform: 'rotate(-4deg)' }}
                    >
                      Mk
                    </span>
                  </div>
                  <div className="flex gap-1 px-3.5 pt-2">
                    <span className="text-[9px] font-semibold px-2 py-1 rounded-full bg-pink-500 text-white shadow-md shadow-pink-500/40">
                      Mi crédito
                    </span>
                    <span className="text-[9px] font-semibold px-2 py-1 rounded-full bg-white/5 text-white/60">
                      Pagos
                    </span>
                    <span className="text-[9px] font-semibold px-2 py-1 rounded-full bg-white/5 text-white/60">
                      Historial
                    </span>
                  </div>
                  <div
                    className="mx-3.5 mt-3 p-3 rounded-2xl relative overflow-hidden"
                    style={{
                      background: `radial-gradient(80% 120% at 10% 0%,rgba(255,255,255,.14),transparent 60%), linear-gradient(135deg,#ec4899,#0ea5e9)`,
                    }}
                  >
                    <div className="text-[8px] font-semibold uppercase tracking-widest text-white/75">
                      Préstamo activo
                    </div>
                    <div className="text-2xl font-bold leading-none mt-0.5">$8,750</div>
                    <div className="text-[9px] text-white/75 mt-0.5">de $14,000 · semanal</div>
                    <div className="mt-3 h-1 rounded-full bg-black/25">
                      <div
                        className="h-full rounded-full"
                        style={{ width: '62%', background: 'linear-gradient(90deg,#fff,#bae6fd)' }}
                      />
                    </div>
                    <div className="flex justify-between text-[8px] text-white/85 mt-1">
                      <span>62% liquidado</span>
                      <span>14 / 22</span>
                    </div>
                  </div>
                  <div className="mx-3.5 mt-3 p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                    <div>
                      <div className="text-[8px] text-white/60">Próximo pago</div>
                      <div className="text-sm font-bold leading-tight">$750.00</div>
                      <div className="text-[8px] text-white/55">Jueves 23 de octubre</div>
                    </div>
                    <span className="text-[9px] font-bold px-2.5 py-1 rounded-full bg-pink-500 text-white">
                      Pagar
                    </span>
                  </div>
                  <div className="mt-auto grid grid-cols-4 px-3.5 pt-2 pb-3 border-t border-white/5 text-[8px]">
                    <div className="flex flex-col items-center gap-0.5 text-pink-500">
                      <span className="w-3 h-3 rounded-sm bg-current opacity-90" />
                      Inicio
                    </div>
                    <div className="flex flex-col items-center gap-0.5 text-white/40">
                      <span className="w-3 h-3 rounded-sm bg-current opacity-90" />
                      Pagos
                    </div>
                    <div className="flex flex-col items-center gap-0.5 text-white/40">
                      <span className="w-3 h-3 rounded-sm bg-current opacity-90" />
                      Tickets
                    </div>
                    <div className="flex flex-col items-center gap-0.5 text-white/40">
                      <span className="w-3 h-3 rounded-sm bg-current opacity-90" />
                      Perfil
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* FEATURES */}
      <section className="max-w-6xl mx-auto px-5 py-16 sm:py-20 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          { title: 'Desde $4,000', desc: 'Préstamos ajustados al tamaño real de tu negocio, sin aval.' },
          { title: 'Grupos solidarios', desc: 'Hasta 5 personas se respaldan entre sí y crecen juntas.' },
          { title: 'Aprobación 48 h', desc: 'Captura con tu coordinadora y resolución en dos días.' },
          { title: '100 % digital', desc: 'Firma, desembolso y pagos sin papeleos interminables.' },
        ].map((f) => (
          <div
            key={f.title}
            className="rounded-2xl p-5 border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent"
          >
            <div className="flex items-center gap-2 text-pink-400 mb-2">
              <span className="w-7 h-7 rounded-full bg-pink-500/20 border border-pink-500/40" />
            </div>
            <h3 className="text-lg font-semibold tracking-tight">{f.title}</h3>
            <p className="text-sm text-white/65 mt-1">{f.desc}</p>
          </div>
        ))}
      </section>

      {/* CTA FINAL */}
      <section className="max-w-6xl mx-auto px-5 pb-16">
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
            Lista para hacer crecer tu negocio
          </h2>
          <p className="text-white/70 mt-3 max-w-md mx-auto">
            Platica con una asesora. Te decimos en minutos si calificas y cuánto podrías
            recibir en tu primer crédito.
          </p>
          <div className="flex flex-wrap gap-3 justify-center mt-6">
            <Link
              href="https://wa.me/525226262627?text=Hola%2C+quisiera+información+sobre+un+microcrédito"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white text-pink-600 font-semibold hover:bg-white/95 transition"
            >
              Hablar por WhatsApp
            </Link>
            <Link
              href="https://www.facebook.com/microkapital"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-white/25 font-semibold hover:bg-white/10 transition"
            >
              Síguenos en Facebook
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
            <Link href="https://www.facebook.com/microkapital" target="_blank" rel="noopener" className="hover:text-white transition">
              Facebook
            </Link>
            <Link href="/login" className="hover:text-white transition">
              Soy cliente
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
