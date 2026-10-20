import { ImageResponse } from 'next/og'

export const runtime = 'edge'

/**
 * PWA icon 192×192 — sin fuentes externas (el fetch a jsDelivr
 * fallaba silenciosamente en edge y devolvía 500). Usa un bold
 * italic con la fuente default de next/og; se ve bien y nunca falla.
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
          backgroundImage: `radial-gradient(130% 170% at 10% 10%, #ff6ab0 0%, transparent 55%),
                             radial-gradient(110% 170% at 90% 90%, #38bdf8 0%, transparent 55%),
                             linear-gradient(120deg, #ec4899 0%, #d946ef 45%, #0ea5e9 100%)`,
        }}
      >
        <div
          style={{
            fontSize: 150,
            lineHeight: 0.85,
            letterSpacing: -8,
            color: '#fff',
            fontWeight: 900,
            fontStyle: 'italic',
            transform: 'rotate(-5deg)',
            textShadow: '0 6px 12px rgba(0,0,0,.22)',
            display: 'flex',
          }}
        >
          Mk
        </div>
      </div>
    ),
    { width: 192, height: 192 },
  )
}
