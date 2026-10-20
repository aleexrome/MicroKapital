'use client'

import { useEffect, useState } from 'react'

/**
 * Carrusel del hero: solo el mockup del celular rota entre 4 pantallas
 * del portal del cliente (Mi crédito, Calendario, Ticket, Historial).
 * Debajo del celular hay indicadores clicables y una etiqueta con
 * el nombre de la pantalla activa.
 *
 * Autoplay cada 5s, pausable al tocar/hover. Respeta
 * prefers-reduced-motion.
 */

const SLIDES = [
  { key: 'credito',    label: 'Mi crédito',    Mock: MockCredito },
  { key: 'calendario', label: 'Calendario',    Mock: MockCalendario },
  { key: 'ticket',     label: 'Tickets',       Mock: MockTicket },
  { key: 'historial',  label: 'Historial',     Mock: MockHistorial },
] as const

export function PhoneCarousel() {
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const reduceMotion = usePrefersReducedMotion()

  useEffect(() => {
    if (reduceMotion || paused) return
    const id = window.setInterval(() => {
      setIdx((i) => (i + 1) % SLIDES.length)
    }, 5000)
    return () => window.clearInterval(id)
  }, [paused, reduceMotion])

  const Current = SLIDES[idx].Mock

  return (
    <div
      className="flex flex-col items-center gap-4"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onPointerDown={() => setPaused(true)}
    >
      <div
        className="relative mx-auto"
        style={{ width: 'min(300px, 72vw)', aspectRatio: '9 / 19.5', transform: 'rotate(5deg)' }}
      >
        {/* Cross-fade entre pantallas */}
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

      {/* Etiqueta + indicadores */}
      <div className="flex flex-col items-center gap-2 text-white" style={{ transform: 'rotate(5deg)' }}>
        <span className="text-xs font-semibold uppercase tracking-[.2em] text-white/90">
          {SLIDES[idx].label}
        </span>
        <div className="flex gap-1.5">
          {SLIDES.map((s, i) => (
            <button
              key={s.key}
              onClick={() => { setIdx(i); setPaused(true) }}
              aria-label={`Ver ${s.label}`}
              className={`h-1.5 rounded-full transition-all ${
                i === idx ? 'w-6 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/70'
              }`}
            />
          ))}
        </div>
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
        boxShadow:
          '0 25px 50px rgba(0,0,0,.4), 0 10px 20px rgba(0,0,0,.25), inset 0 0 0 1px rgba(255,255,255,.06)',
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
        <div className="text-[9px] text-white/60">
          Hola,<br /><b className="text-white text-[11px] font-semibold">Guadalupe</b>
        </div>
        <span className="text-pink-500 italic font-black text-2xl leading-none" style={{ fontFamily: 'var(--font-permanent-marker), cursive', transform: 'rotate(-4deg)' }}>Mk</span>
      </div>
      <div className="flex gap-1 px-3.5 pt-2">
        <span className="text-[9px] font-semibold px-2 py-1 rounded-full bg-pink-500 text-white shadow-md shadow-pink-500/40">Mi crédito</span>
        <span className="text-[9px] font-semibold px-2 py-1 rounded-full bg-white/5 text-white/60">Pagos</span>
        <span className="text-[9px] font-semibold px-2 py-1 rounded-full bg-white/5 text-white/60">Historial</span>
      </div>
      <div className="mx-3.5 mt-3 p-3 rounded-2xl relative overflow-hidden" style={{ background: 'radial-gradient(80% 120% at 10% 0%,rgba(255,255,255,.14),transparent 60%), linear-gradient(135deg,#ec4899,#0ea5e9)' }}>
        <div className="text-[8px] font-semibold uppercase tracking-widest text-white/75">Préstamo activo</div>
        <div className="text-2xl font-bold leading-none mt-0.5">$8,750</div>
        <div className="text-[9px] text-white/75 mt-0.5">de $14,000 · semanal</div>
        <div className="mt-3 h-1 rounded-full bg-black/25">
          <div className="h-full rounded-full" style={{ width: '62%', background: 'linear-gradient(90deg,#fff,#bae6fd)' }} />
        </div>
        <div className="flex justify-between text-[8px] text-white/85 mt-1"><span>62% liquidado</span><span>14 / 22</span></div>
      </div>
      <div className="mx-3.5 mt-3 p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
        <div>
          <div className="text-[8px] text-white/60">Próximo pago</div>
          <div className="text-sm font-bold leading-tight">$750.00</div>
          <div className="text-[8px] text-white/55">Jueves 23 de octubre</div>
        </div>
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
      <div className="px-3.5 pt-3">
        <div className="text-[9px] text-white/60">Calendario</div>
        <div className="text-sm font-bold">Octubre 2026</div>
      </div>
      <div className="mt-3 flex-1 overflow-hidden px-3.5">
        {cuotas.map((c) => (
          <div key={c.n} className="flex items-center gap-2.5 py-1.5 border-b border-white/5 last:border-0">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold ${
              c.estado === 'ok' ? 'bg-emerald-500/20 text-emerald-300' :
              c.estado === 'now' ? 'bg-pink-500 text-white shadow-md shadow-pink-500/40' :
              'bg-white/5 text-white/40'
            }`}>
              {c.estado === 'ok' ? '✓' : c.n}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold text-white">Pago {c.n}</div>
              <div className="text-[8px] text-white/50">{c.fecha}</div>
            </div>
            <div className={`text-[10px] font-bold ${c.estado === 'ok' ? 'text-emerald-300' : 'text-white'}`}>{c.m}</div>
          </div>
        ))}
      </div>
      <div className="mx-3.5 mb-3 p-2 rounded-lg bg-pink-500/15 border border-pink-500/30 text-center">
        <div className="text-[8px] text-pink-200">Faltan</div>
        <div className="text-sm font-bold text-white">8 pagos · $6,000</div>
      </div>
    </>
  )
}

function MockTicket() {
  return (
    <>
      <div className="px-3.5 pt-3 flex items-center justify-between">
        <div>
          <div className="text-[9px] text-white/60">Pago aplicado</div>
          <div className="text-sm font-bold">Ticket #4821-A</div>
        </div>
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
          <div className="flex justify-between items-center pt-2 border-t border-dashed border-gray-300 mt-2">
            <span className="text-[10px] font-semibold">Total</span>
            <b className="text-pink-600 text-base">$750.00</b>
          </div>
        </div>
        <div className="mt-2 pt-2 border-t border-dashed border-gray-300 flex justify-center">
          <div className="flex gap-0.5">
            {Array.from({ length: 24 }).map((_, i) => (
              <span key={i} className="w-0.5 h-6 bg-gray-900" style={{ opacity: (i * 7) % 10 > 3 ? 1 : 0.3 }} />
            ))}
          </div>
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
      <div className="px-3.5 pt-3">
        <div className="text-[9px] text-white/60">Tu historial</div>
        <div className="text-sm font-bold">3 créditos</div>
      </div>
      <div className="mx-3.5 mt-3 p-3 rounded-xl relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#ec4899,#0ea5e9)' }}>
        <div className="text-[8px] font-semibold uppercase tracking-widest text-white/80">Tu score</div>
        <div className="flex items-end gap-1 mt-0.5">
          <div className="text-3xl font-bold leading-none">A+</div>
          <div className="text-[9px] text-white/80 pb-0.5">de A+ máximo</div>
        </div>
        <div className="mt-2 flex gap-1">
          {Array.from({ length: 10 }).map((_, i) => (
            <span key={i} className={`flex-1 h-1 rounded-full ${i < 9 ? 'bg-white' : 'bg-white/25'}`} />
          ))}
        </div>
        <div className="text-[8px] text-white/80 mt-1">Califica para créditos de hasta <b>$25,000</b></div>
      </div>
      <div className="mt-3 flex-1 overflow-hidden px-3.5">
        <div className="text-[8px] uppercase tracking-widest text-white/50 mb-1.5 font-semibold">Créditos</div>
        {historial.map((h) => (
          <div key={h.n} className="flex items-center gap-2.5 py-1.5 border-b border-white/5 last:border-0">
            <div className={`w-7 h-7 rounded-full border-2 border-current ${h.color} flex items-center justify-center text-[9px] font-bold`}>
              #{h.n}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold text-white capitalize">{h.estado}</div>
              <div className="text-[8px] text-white/50">{h.monto}</div>
            </div>
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
