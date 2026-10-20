import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

/**
 * Apple touch icon — iOS Safari lo usa cuando "Añadir a pantalla de
 * inicio". Siempre PNG, nunca SVG (iOS lo ignora).
 */
export default async function AppleIcon() {
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
          alignItems: 'center',
          justifyContent: 'center',
          backgroundImage: `
            radial-gradient(130% 170% at 10% 10%, #ff6ab0 0%, transparent 55%),
            radial-gradient(110% 170% at 90% 90%, #38bdf8 0%, transparent 55%),
            linear-gradient(120deg, #ec4899 0%, #d946ef 45%, #0ea5e9 100%)
          `,
        }}
      >
        <div
          style={{
            fontFamily: 'MK, cursive',
            fontSize: 160,
            lineHeight: 0.85,
            letterSpacing: -5,
            color: '#fff',
            transform: 'rotate(-5deg) translateY(8px)',
            textShadow: '0 6px 12px rgba(0,0,0,.22)',
            display: 'flex',
          }}
        >
          Mk
        </div>
      </div>
    ),
    {
      ...size,
      fonts: permanentMarker
        ? [{ name: 'MK', data: permanentMarker, style: 'normal', weight: 400 }]
        : undefined,
    },
  )
}
