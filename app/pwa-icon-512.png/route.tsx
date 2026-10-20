import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET() {
  const permanentMarker = await fetch(
    'https://fonts.gstatic.com/s/permanentmarker/v16/Fh4uPib9Iyv2ucM6pGQMWimMp004Hao.ttf',
  ).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
          backgroundImage: 'linear-gradient(135deg, #ec4899 0%, #0ea5e9 100%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontFamily: permanentMarker ? 'PermanentMarker' : 'sans-serif',
            fontSize: permanentMarker ? 310 : 400,
            lineHeight: 0.85,
            letterSpacing: permanentMarker ? -8 : -20,
            color: '#fff',
            fontWeight: permanentMarker ? 400 : 900,
            fontStyle: permanentMarker ? 'normal' : 'italic',
            transform: 'rotate(-5deg) translateY(14px)',
            textShadow: '0 15px 30px rgba(0,0,0,.22)',
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
        ? [{ name: 'PermanentMarker', data: permanentMarker, style: 'normal', weight: 400 }]
        : undefined,
    },
  )
}
