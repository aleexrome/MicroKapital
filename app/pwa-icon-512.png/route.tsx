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
          fontFamily: 'Inter',
          backgroundImage: 'linear-gradient(135deg, #ff2d92 0%, #0ea5e9 100%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontFamily: permanentMarker ? 'PermanentMarker' : 'Inter',
            fontSize: permanentMarker ? 310 : 400,
            lineHeight: 1,
            letterSpacing: permanentMarker ? -8 : -20,
            color: '#fff',
            fontWeight: permanentMarker ? 400 : 900,
            fontStyle: permanentMarker ? 'normal' : 'italic',
            textShadow: '0 15px 30px rgba(0,0,0,.22)',
            paddingLeft: 0,
            transform: permanentMarker ? 'translateY(-54px)' : 'none',
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
