import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'MicroKapital — Microcréditos que impulsan tu negocio'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * Open Graph image generada en runtime (next/og).
 *
 * Lo que WhatsApp / Facebook / Slack / iMessage muestran como preview
 * cuando se comparte https://microkapital.com.
 *
 * NOTA: NO cargamos fuentes externas aquí. El fetch a jsDelivr fallaba
 * silenciosamente en producción y la ruta devolvía 500, por eso el
 * crawler recibía basura y no mostraba imagen. Usamos la fuente default
 * de next/og (geometric sans) — se ve bien y jamás falla.
 */
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          color: '#fff',
          position: 'relative',
          fontFamily: 'Inter, sans-serif',
          backgroundImage: `
            radial-gradient(130% 170% at 8% 8%, #ff6ab0 0%, transparent 55%),
            radial-gradient(110% 170% at 95% 95%, #38bdf8 0%, transparent 55%),
            linear-gradient(120deg, #ec4899 0%, #d946ef 35%, #6366f1 65%, #0ea5e9 100%)
          `,
        }}
      >
        {/* Padding + layout del contenido */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '72px 88px',
            width: '100%',
            height: '100%',
          }}
        >
          {/* Top row: badge + logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
            <div
              style={{
                fontSize: 16,
                letterSpacing: 6,
                textTransform: 'uppercase',
                fontWeight: 700,
                padding: '10px 20px',
                borderRadius: 999,
                border: '2px solid rgba(255,255,255,.5)',
              }}
            >
              Financiera
            </div>
          </div>

          {/* Centro: logo Mk + headline */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 32,
              }}
            >
              <div
                style={{
                  fontSize: 220,
                  lineHeight: 0.85,
                  letterSpacing: -10,
                  color: '#fff',
                  fontWeight: 900,
                  fontStyle: 'italic',
                  transform: 'rotate(-4deg)',
                  textShadow: '0 10px 30px rgba(0,0,0,.18)',
                  display: 'flex',
                }}
              >
                Mk
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div style={{ fontSize: 72, fontWeight: 800, letterSpacing: -2, lineHeight: 1 }}>
                  MicroKapital
                </div>
                <div
                  style={{
                    fontSize: 20,
                    letterSpacing: 8,
                    textTransform: 'uppercase',
                    fontWeight: 500,
                    opacity: 0.85,
                  }}
                >
                  Crédito en movimiento
                </div>
              </div>
            </div>

            <div
              style={{
                fontSize: 54,
                fontWeight: 700,
                letterSpacing: -1.5,
                lineHeight: 1.1,
                maxWidth: 900,
              }}
            >
              Microcréditos que impulsan tu negocio.
            </div>
          </div>

          {/* Footer: dominio */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: 1,
            }}
          >
            <span style={{ display: 'flex' }}>microkapital.com</span>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: '#fff',
                opacity: 0.7,
              }}
            />
            <span style={{ opacity: 0.85 }}>Préstamos grupales e individuales</span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
