import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

/**
 * Apple touch icon — iOS Safari lo usa cuando "Añadir a pantalla
 * de inicio". Permanent Marker para el "Mk", gradient rosa→azul
 * directo (sin pasar por morado).
 */
export default async function AppleIcon() {
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
            fontSize: permanentMarker ? 100 : 140,
            lineHeight: 1,
            letterSpacing: permanentMarker ? -2 : -8,
            color: '#fff',
            fontWeight: permanentMarker ? 400 : 900,
            fontStyle: permanentMarker ? 'normal' : 'italic',
            textShadow: '0 6px 12px rgba(0,0,0,.22)',
            // Permanent Marker tiene bearing izquierdo grande — el texto
            // mide más del lado izq que del der, visualmente queda corrido
            // a la izquierda aunque flex lo centre. Compensamos con padding.
            paddingLeft: permanentMarker ? 10 : 0,
          }}
        >
          Mk
        </div>
      </div>
    ),
    {
      ...size,
      fonts: permanentMarker
        ? [{ name: 'PermanentMarker', data: permanentMarker, style: 'normal', weight: 400 }]
        : undefined,
    },
  )
}
