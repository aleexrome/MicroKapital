import { ImageResponse } from 'next/og'

export const runtime = 'edge'

/**
 * Maskable icon — Android recorta por forma del launcher. Logo
 * dentro del safe-zone central (40%) con fondo plano hasta el borde.
 */
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundImage: 'radial-gradient(circle at 50% 50%, #d946ef 0%, #ec4899 50%, #0ea5e9 100%)',
        }}
      >
        <div
          style={{
            fontSize: 260,
            lineHeight: 0.85,
            letterSpacing: -12,
            color: '#fff',
            fontWeight: 900,
            fontStyle: 'italic',
            transform: 'rotate(-5deg)',
            textShadow: '0 10px 20px rgba(0,0,0,.22)',
            display: 'flex',
          }}
        >
          Mk
        </div>
      </div>
    ),
    { width: 512, height: 512 },
  )
}
