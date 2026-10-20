import { ImageResponse } from 'next/og'

export const runtime = 'edge'

/**
 * Maskable icon — Android recorta el borde según la forma del launcher
 * del device (círculo, squircle, etc.). Mantenemos el logo dentro del
 * "safe zone" central (40% del total) con fondo plano que llena hasta
 * el borde para que ninguna forma recorte la Mk.
 */
export async function GET() {
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
            radial-gradient(circle at 50% 50%, #d946ef 0%, #ec4899 50%, #0ea5e9 100%)
          `,
        }}
      >
        <div
          style={{
            fontFamily: 'MK, cursive',
            fontSize: 280,
            lineHeight: 0.85,
            letterSpacing: -8,
            color: '#fff',
            transform: 'rotate(-5deg)',
            textShadow: '0 10px 20px rgba(0,0,0,.22)',
            display: 'flex',
          }}
        >
          Mk
        </div>
      </div>
    ),
    {
      width: 512,
      height: 512,
      fonts: permanentMarker
        ? [{ name: 'MK', data: permanentMarker, style: 'normal', weight: 400 }]
        : undefined,
    },
  )
}
