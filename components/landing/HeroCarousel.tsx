'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { InstallAppButton } from './InstallAppButton'

/**
 * Hero carrusel estilo QUIUBO — ocupa todo el bloque principal del
 * landing. Cada slide es un pitch distinto (microcrédito, calendario,
 * tickets, grupos, score…) con fondo propio, badge, headline, 3
 * bullets, CTAs y un mockup del celular con la pantalla relacionada.
 *
 * Navegación: flechas chevron laterales (desktop) + dots clicables
 * abajo. Autoplay 7s pausable al tocar. Cross-fade suave entre slides.
 */

interface Slide {
  key: string
  badge: string
  title: React.ReactNode
  body: string
  bullets: string[]
  gradient: string
  Mock: () => React.ReactNode
}

const SLIDES: Slide[] = [
  {
    key: 'microcredito',
    badge: '💰 Financiera · desde 2020',
    title: (
      <>
        Cuando nadie apuesta por ti,{' '}
        <span className="bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(90deg,#ffd6ea,#bae6fd)' }}>
          nosotros sí
        </span>
        .
      </>
    ),
    body: 'Préstamos grupales e individuales a tu medida. Aprobación ágil con acompañamiento real en cada etapa.',
    bullets: ['Préstamos desde $4,000', 'Tasas y condiciones claras', 'Resolución en 48 horas'],
    gradient: `radial-gradient(130% 170% at 8% 8%, #ff6ab0 0%, transparent 55%),
               radial-gradient(110% 170% at 95% 95%, #38bdf8 0%, transparent 55%),
               linear-gradient(120deg, #ec4899 0%, #d946ef 35%, #6366f1 65%, #0ea5e9 100%)`,
    Mock: MockCredito,
  },
  {
    key: 'portal',
    badge: '📱 Portal del cliente',
    title: (<>Tu crédito, <em className="not-italic">siempre</em> en tu bolsillo.</>),
    body: 'Consulta tu saldo, próximo pago y tickets desde cualquier celular, sin descargar nada de la Play Store.',
    bullets: ['Saldo y progreso en vivo', 'Alertas de próximo pago', 'Sin trámites presenciales'],
    gradient: `radial-gradient(120% 160% at 90% 10%, #f472b6 0%, transparent 55%),
               radial-gradient(100% 160% at 5% 95%, #22d3ee 0%, transparent 55%),
               linear-gradient(140deg, #be185d 0%, #ec4899 40%, #0ea5e9 100%)`,
    Mock: MockCredito,
  },
  {
    key: 'calendario',
    badge: '📅 Calendario de pagos',
    title: (<>Nunca más <em className="not-italic">pierdas</em> una fecha.</>),
    body: 'Todas tus cuotas organizadas por semana con montos exactos y comprobante por cada pago aplicado.',
    bullets: ['Vista semana a semana', 'Comprobante de cada pago', 'Avisos antes del vencimiento'],
    gradient: `radial-gradient(110% 150% at 15% 20%, #c084fc 0%, transparent 55%),
               radial-gradient(110% 150% at 90% 85%, #06b6d4 0%, transparent 55%),
               linear-gradient(130deg, #a21caf 0%, #d946ef 50%, #0ea5e9 100%)`,
    Mock: MockCalendario,
  },
  {
    key: 'tickets',
    badge: '🎫 Tickets digitales',
    title: (<>Comprobante <em className="not-italic">al instante.</em></>),
    body: 'Cada pago genera un ticket con folio único. Lo descargas, lo compartes y queda guardado para siempre.',
    bullets: ['Folio único por cobro', 'Descarga en PDF', 'Comparte o guarda al instante'],
    gradient: `radial-gradient(140% 180% at 10% 10%, #fb7185 0%, transparent 55%),
               radial-gradient(110% 170% at 95% 90%, #818cf8 0%, transparent 55%),
               linear-gradient(125deg, #e11d48 0%, #ec4899 45%, #6366f1 100%)`,
    Mock: MockTicket,
  },
  {
    key: 'grupos',
    badge: '👥 Grupos solidarios',
    title: (<>Juntas crecemos <em className="not-italic">más rápido.</em></>),
    body: 'Grupos de hasta 5 integrantes que se respaldan entre sí. En solidario avanzan juntas y con tasas más accesibles.',
    bullets: ['Hasta 5 integrantes por grupo', 'Respaldo solidario', 'Mejores tasas al crecer'],
    gradient: `radial-gradient(130% 170% at 8% 95%, #f472b6 0%, transparent 55%),
               radial-gradient(110% 170% at 95% 5%, #38bdf8 0%, transparent 55%),
               linear-gradient(130deg, #db2777 0%, #a855f7 50%, #0284c7 100%)`,
    Mock: MockHistorial,
  },
  {
    key: 'score',
    badge: '⭐ Score crediticio',
    title: (<>Buen pago, créditos <em className="not-italic">más grandes.</em></>),
    body: 'Cada cuota puntual suma a tu score. A mejor score, créditos de hasta $25,000 con tasas preferentes.',
    bullets: ['Score por cada pago puntual', 'Historial transparente', 'Hasta $25,000 de línea'],
    gradient: `radial-gradient(130% 170% at 50% 10%, #ec4899 0%, transparent 55%),
               radial-gradient(110% 170% at 90% 95%, #22d3ee 0%, transparent 55%),
               linear-gradient(140deg, #be185d 0%, #d946ef 40%, #0ea5e9 100%)`,
    Mock: MockHistorial,
  },
]

export function HeroCarousel() {
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const reduceMotion = usePrefersReducedMotion()

  useEffect(() => {
    if (reduceMotion || paused) return
    const id = window.setInterval(() => setIdx((i) => (i + 1) % SLIDES.length), 7000)
    return () => window.clearInterval(id)
  }, [paused, reduceMotion])

  function go(delta: number) {
    setIdx((i) => (i + delta + SLIDES.length) % SLIDES.length)
    setPaused(true)
  }

  return (
    <div
      className="relative overflow-hidden"
      onPointerDown={() => setPaused(true)}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      {/* Capa de fondos — cross-fade entre gradientes */}
      {SLIDES.map((s, i) => (
        <div
          key={s.key}
          aria-hidden
          className="absolute inset-0 transition-opacity duration-700"
          style={{
            opacity: i === idx ? 1 : 0,
            backgroundImage: s.gradient,
          }}
        />
      ))}
      {/* Grano sutil */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-30 pointer-events-none mix-blend-overlay"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,.08) 1px, transparent 1px)',
          backgroundSize: '3px 3px',
        }}
      />

      {/* Flechas al viewport (pegadas a los bordes de la pantalla, no al container) */}
      <button
        onClick={() => go(-1)}
        aria-label="Slide anterior"
        className="hidden sm:flex absolute left-3 md:left-6 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/15 backdrop-blur-sm border border-white/30 items-center justify-center text-white hover:bg-white/25 transition"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
      </button>
      <button
        onClick={() => go(+1)}
        aria-label="Slide siguiente"
        className="hidden sm:flex absolute right-3 md:right-6 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/15 backdrop-blur-sm border border-white/30 items-center justify-center text-white hover:bg-white/25 transition"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
      </button>

      {/* Contenido */}
      <div className="relative max-w-6xl mx-auto px-5 pt-14 pb-16 sm:pt-20 sm:pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_.9fr] gap-10 items-center">
          <div className="min-w-0 flex flex-col gap-4">
            <span className="self-start text-[11px] font-bold uppercase tracking-[.2em] px-3 py-1.5 rounded-full border border-white/50 backdrop-blur-sm text-white">
              {SLIDES[idx].badge}
            </span>

            {/* Headline + body — cross-fade */}
            <div className="relative min-h-[26rem] sm:min-h-[22rem] lg:min-h-[24rem]">
              {SLIDES.map((s, i) => (
                <div
                  key={s.key}
                  className="absolute inset-0 transition-opacity duration-500 flex flex-col gap-3"
                  style={{ opacity: i === idx ? 1 : 0, pointerEvents: i === idx ? 'auto' : 'none' }}
                >
                  <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.02] tracking-tight text-balance text-white">
                    {s.title}
                  </h1>
                  <p className="text-base sm:text-lg text-white/85 max-w-xl">
                    {s.body}
                  </p>
                  <ul className="flex flex-col gap-1.5 mt-1">
                    {s.bullets.map((b) => (
                      <li key={b} className="flex items-center gap-2 text-sm sm:text-base text-white">
                        <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                          <path d="m5 12 5 5L20 7" />
                        </svg>
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3 mt-6">
              <InstallAppButton />
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-full border-2 border-white/40 text-white/90 font-semibold hover:bg-white/10 hover:border-white/70 transition text-sm"
              >
                Iniciar sesión
              </Link>
            </div>
          </div>

          {/* Mockup del celular */}
          <div className="justify-self-center lg:justify-self-end relative" style={{ width: 'min(260px, 72vw)' }}>
            <div
              className="relative mx-auto"
              style={{ width: '100%', aspectRatio: '9 / 19.5', transform: 'rotate(5deg)' }}
            >
              {SLIDES.map((s, i) => (
                <div
                  key={s.key}
                  className="absolute inset-0 transition-opacity duration-500"
                  style={{ opacity: i === idx ? 1 : 0, pointerEvents: i === idx ? 'auto' : 'none' }}
                >
                  <PhoneFrame>
                    <s.Mock />
                  </PhoneFrame>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* Dots centrados absolutos abajo del carrusel entero */}
      <div className="relative flex justify-center gap-2 pb-6 sm:pb-8">
        {SLIDES.map((s, i) => (
          <button
            key={s.key}
            onClick={() => { setIdx(i); setPaused(true) }}
            aria-label={`Ir al slide ${i + 1}`}
            className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-8 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/70'}`}
          />
        ))}
      </div>
    </div>
  )
}

// ─────────── Frame + mockups ───────────

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="w-full h-full rounded-[2.4rem] p-1.5 relative"
      style={{
        background: '#0f0d24',
        border: '3px solid #1a1735',
        boxShadow: '0 25px 50px rgba(0,0,0,.4), 0 10px 20px rgba(0,0,0,.25), inset 0 0 0 1px rgba(255,255,255,.06)',
      }}
    >
      <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-16 h-3 rounded-full bg-black z-10" />
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
        {children}
      </div>
    </div>
  )
}

function MockCredito() {
  return (
    <>
      <div className="flex items-center justify-between px-3.5 pt-3 pb-1">
        <div className="text-[9px] text-white/60">Hola,<br /><b className="text-white text-[11px] font-semibold">Guadalupe</b></div>
        <span className="text-pink-500 italic font-black text-2xl leading-none" style={{ fontFamily: 'var(--font-permanent-marker), cursive', transform: 'rotate(-4deg)' }}>Mk</span>
      </div>
      <div className="mx-3.5 mt-3 p-3 rounded-2xl relative overflow-hidden" style={{ background: 'radial-gradient(80% 120% at 10% 0%,rgba(255,255,255,.14),transparent 60%), linear-gradient(135deg,#ec4899,#0ea5e9)' }}>
        <div className="text-[8px] font-semibold uppercase tracking-widest text-white/75">Préstamo activo</div>
        <div className="text-2xl font-bold leading-none mt-0.5">$8,750</div>
        <div className="text-[9px] text-white/75 mt-0.5">de $14,000 · semanal</div>
        <div className="mt-3 h-1 rounded-full bg-black/25"><div className="h-full rounded-full" style={{ width: '62%', background: 'linear-gradient(90deg,#fff,#bae6fd)' }} /></div>
        <div className="flex justify-between text-[8px] text-white/85 mt-1"><span>62% liquidado</span><span>14 / 22</span></div>
      </div>
      <div className="mx-3.5 mt-3 p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
        <div><div className="text-[8px] text-white/60">Próximo pago</div><div className="text-sm font-bold leading-tight">$750.00</div><div className="text-[8px] text-white/55">Jueves 23 de octubre</div></div>
        <span className="text-[9px] font-bold px-2.5 py-1 rounded-full bg-pink-500 text-white">Pagar</span>
      </div>
      <div className="mt-auto grid grid-cols-4 px-3.5 pt-2 pb-3 border-t border-white/5 text-[8px]">
        <div className="flex flex-col items-center gap-0.5 text-pink-500"><span className="w-3 h-3 rounded-sm bg-current opacity-90" />Inicio</div>
        <div className="flex flex-col items-center gap-0.5 text-white/40"><span className="w-3 h-3 rounded-sm bg-current opacity-90" />Pagos</div>
        <div className="flex flex-col items-center gap-0.5 text-white/40"><span className="w-3 h-3 rounded-sm bg-current opacity-90" />Tickets</div>
        <div className="flex flex-col items-center gap-0.5 text-white/40"><span className="w-3 h-3 rounded-sm bg-current opacity-90" />Perfil</div>
      </div>
    </>
  )
}

function MockCalendario() {
  const cuotas = [
    { n: 12, m: '$750', fecha: '09 oct', estado: 'ok' },
    { n: 13, m: '$750', fecha: '16 oct', estado: 'ok' },
    { n: 14, m: '$750', fecha: '23 oct', estado: 'now' },
    { n: 15, m: '$750', fecha: '30 oct', estado: 'next' },
    { n: 16, m: '$750', fecha: '06 nov', estado: 'next' },
    { n: 17, m: '$750', fecha: '13 nov', estado: 'next' },
  ]
  return (
    <>
      <div className="px-3.5 pt-3"><div className="text-[9px] text-white/60">Calendario</div><div className="text-sm font-bold">Octubre 2026</div></div>
      <div className="mt-3 flex-1 overflow-hidden px-3.5">
        {cuotas.map((c) => (
          <div key={c.n} className="flex items-center gap-2.5 py-1.5 border-b border-white/5 last:border-0">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold ${c.estado === 'ok' ? 'bg-emerald-500/20 text-emerald-300' : c.estado === 'now' ? 'bg-pink-500 text-white shadow-md shadow-pink-500/40' : 'bg-white/5 text-white/40'}`}>{c.estado === 'ok' ? '✓' : c.n}</div>
            <div className="flex-1 min-w-0"><div className="text-[10px] font-semibold text-white">Pago {c.n}</div><div className="text-[8px] text-white/50">{c.fecha}</div></div>
            <div className={`text-[10px] font-bold ${c.estado === 'ok' ? 'text-emerald-300' : 'text-white'}`}>{c.m}</div>
          </div>
        ))}
      </div>
      <div className="mx-3.5 mb-3 p-2 rounded-lg bg-pink-500/15 border border-pink-500/30 text-center"><div className="text-[8px] text-pink-200">Faltan</div><div className="text-sm font-bold text-white">8 pagos · $6,000</div></div>
    </>
  )
}

function MockTicket() {
  return (
    <>
      <div className="px-3.5 pt-3 flex items-center justify-between">
        <div><div className="text-[9px] text-white/60">Pago aplicado</div><div className="text-sm font-bold">Ticket #4821-A</div></div>
        <span className="text-[8px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold">Pagado</span>
      </div>
      <div className="mx-3.5 mt-3 rounded-xl bg-white text-gray-900 p-3 relative" style={{ boxShadow: '0 10px 30px rgba(0,0,0,.4)' }}>
        <div className="text-center border-b border-dashed border-gray-300 pb-2">
          <div className="text-pink-500 italic font-black text-lg leading-none" style={{ fontFamily: 'var(--font-permanent-marker), cursive', transform: 'rotate(-3deg)' }}>Mk</div>
          <div className="text-[7px] text-gray-500 uppercase tracking-widest mt-0.5">MicroKapital Financiera</div>
        </div>
        <div className="pt-2 text-[9px] space-y-1 text-gray-700">
          <div className="flex justify-between"><span>Cliente</span><b className="text-gray-900">G. López A.</b></div>
          <div className="flex justify-between"><span>Pago #</span><b className="text-gray-900">14 de 22</b></div>
          <div className="flex justify-between"><span>Fecha</span><b className="text-gray-900">16/10/2026</b></div>
          <div className="flex justify-between"><span>Método</span><b className="text-gray-900">Efectivo</b></div>
          <div className="flex justify-between items-center pt-2 border-t border-dashed border-gray-300 mt-2"><span className="text-[10px] font-semibold">Total</span><b className="text-pink-600 text-base">$750.00</b></div>
        </div>
        <div className="mt-2 pt-2 border-t border-dashed border-gray-300 flex justify-center">
          <div className="flex gap-0.5">{Array.from({ length: 24 }).map((_, i) => (<span key={i} className="w-0.5 h-6 bg-gray-900" style={{ opacity: (i * 7) % 10 > 3 ? 1 : 0.3 }} />))}</div>
        </div>
      </div>
      <div className="mt-auto px-3.5 pb-3 pt-2 flex gap-2">
        <span className="flex-1 text-center text-[10px] font-bold py-2 rounded-full bg-pink-500 text-white">Descargar PDF</span>
        <span className="flex-1 text-center text-[10px] font-bold py-2 rounded-full bg-white/10 border border-white/15 text-white">Compartir</span>
      </div>
    </>
  )
}

function MockHistorial() {
  const historial = [
    { n: 3, estado: 'activo', monto: '$14,000', color: 'text-pink-300' },
    { n: 2, estado: 'liquidado', monto: '$10,000', color: 'text-emerald-300' },
    { n: 1, estado: 'liquidado', monto: '$6,000', color: 'text-emerald-300' },
  ]
  return (
    <>
      <div className="px-3.5 pt-3"><div className="text-[9px] text-white/60">Tu historial</div><div className="text-sm font-bold">3 créditos</div></div>
      <div className="mx-3.5 mt-3 p-3 rounded-xl relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#ec4899,#0ea5e9)' }}>
        <div className="text-[8px] font-semibold uppercase tracking-widest text-white/80">Tu score</div>
        <div className="flex items-end gap-1 mt-0.5"><div className="text-3xl font-bold leading-none">A+</div><div className="text-[9px] text-white/80 pb-0.5">de A+ máximo</div></div>
        <div className="mt-2 flex gap-1">{Array.from({ length: 10 }).map((_, i) => (<span key={i} className={`flex-1 h-1 rounded-full ${i < 9 ? 'bg-white' : 'bg-white/25'}`} />))}</div>
        <div className="text-[8px] text-white/80 mt-1">Califica para créditos de hasta <b>$25,000</b></div>
      </div>
      <div className="mt-3 flex-1 overflow-hidden px-3.5">
        <div className="text-[8px] uppercase tracking-widest text-white/50 mb-1.5 font-semibold">Créditos</div>
        {historial.map((h) => (
          <div key={h.n} className="flex items-center gap-2.5 py-1.5 border-b border-white/5 last:border-0">
            <div className={`w-7 h-7 rounded-full border-2 border-current ${h.color} flex items-center justify-center text-[9px] font-bold`}>#{h.n}</div>
            <div className="flex-1 min-w-0"><div className="text-[10px] font-semibold text-white capitalize">{h.estado}</div><div className="text-[8px] text-white/50">{h.monto}</div></div>
            <div className={`text-[9px] ${h.color}`}>{h.estado === 'activo' ? 'En curso' : 'Pagado'}</div>
          </div>
        ))}
      </div>
    </>
  )
}

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduce(mq.matches)
    const onChange = () => setReduce(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduce
}
