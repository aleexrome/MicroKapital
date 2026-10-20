import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'MicroKapital — Microcréditos que impulsan tu negocio'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * Open Graph image generada en runtime (next/og).
 *
 * Vive al lado del landing (`app/page.tsx`) para que Next.js la
 * sirva en `/opengraph-image` y añada los <meta og:image> + los
 * <meta twitter:image> al <head> de la ruta "/" automáticamente.
 *
 * Esto es lo que WhatsApp / Facebook / Slack / iMessage muestran
 * como preview cuando se comparte https://microkapital.com.
 *
 * Diseño: mismo gradient rosa→azul del landing, logo "Mk" en marker
 * (fuente cargada de Google Fonts) y copy jerárquico. Sin mockup
 * del celular porque `next/og` solo acepta un subset de CSS y mantener
 * el mockup legible al escalar es trabajo adicional sin pagar lo que
 * cuesta en complejidad; el banner interactivo del artifact ya cubre
 * ese caso para redes.
 */
export default async function Image() {
  // Fuente display — Permanent Marker. next/og necesita el buffer de
  // la fuente, no basta con el nombre; Google Fonts no sirve el .ttf
  // directo así que vamos a jsDelivr que sí lo expone estático.
  const permanentMarker = await fetch(
    'https://cdn.jsdelivr.net/npm/@fontsource/permanent-marker@5.0.17/files/permanent-marker-latin-400-normal.woff',
  ).then((res) => res.arrayBuffer()).catch(() => null)

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
                  fontFamily: 'MK, cursive',
                  fontSize: 240,
                  lineHeight: 0.85,
                  letterSpacing: -8,
                  color: '#fff',
                  transform: 'rotate(-4deg)',
                  textShadow: '0 10px 30px rgba(0,0,0,.15)',
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
    {
      ...size,
      fonts: permanentMarker
        ? [
            {
              name: 'MK',
              data: permanentMarker,
              style: 'normal',
              weight: 400,
            },
          ]
        : undefined,
    },
  )
}
