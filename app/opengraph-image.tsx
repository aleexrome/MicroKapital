import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'MicroKapital — Microcréditos que impulsan tu negocio'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * Open Graph image del landing — lo que WhatsApp / Facebook / Slack /
 * iMessage muestran como preview al compartir https://microkapital.com.
 *
 * Diseño: mismo gradient rosa→azul del landing, logo Mk grande italic,
 * wordmark MicroKapital + Crédito en movimiento, headline y a la derecha
 * un mockup del celular con el préstamo activo de Guadalupe (igual al
 * artifact que aprobó Dirección).
 *
 * Sin dependencia de fuentes externas (fetch a jsDelivr fallaba
 * silenciosamente en edge). Usa la fuente default de next/og con
 * italic + letter-spacing para simular el feel marker.
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
          backgroundImage: `
            radial-gradient(130% 170% at 8% 8%, #ff6ab0 0%, transparent 55%),
            radial-gradient(110% 170% at 95% 95%, #38bdf8 0%, transparent 55%),
            linear-gradient(120deg, #ec4899 0%, #d946ef 35%, #6366f1 65%, #0ea5e9 100%)
          `,
        }}
      >
        {/* Grid 2 columnas: texto izq, mockup derecho */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '100%',
            padding: '30px 70px 50px',
          }}
        >
          {/* COLUMNA IZQUIERDA — Logo + copy, pegado arriba */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              flex: 1,
              marginRight: 50,
            }}
          >
            {/* Badge FINANCIERA */}
            <div
              style={{
                display: 'flex',
                fontSize: 15,
                letterSpacing: 5,
                textTransform: 'uppercase',
                fontWeight: 700,
                padding: '8px 20px',
                borderRadius: 999,
                border: '2px solid rgba(255,255,255,.5)',
                color: '#fff',
                alignSelf: 'flex-start',
              }}
            >
              Financiera · desde 2020
            </div>

            {/* Mk marker gigante */}
            <div
              style={{
                display: 'flex',
                fontSize: 260,
                lineHeight: 0.85,
                letterSpacing: -14,
                color: '#fff',
                fontWeight: 900,
                fontStyle: 'italic',
                transform: 'rotate(-5deg) translateX(-10px)',
                textShadow: '0 10px 30px rgba(0,0,0,.2)',
                marginBottom: -20,
              }}
            >
              Mk
            </div>

            {/* Wordmark + headline */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', fontSize: 68, fontWeight: 800, letterSpacing: -2, lineHeight: 1 }}>
                  MicroKapital
                </div>
                <div
                  style={{
                    display: 'flex',
                    fontSize: 18,
                    letterSpacing: 8,
                    textTransform: 'uppercase',
                    fontWeight: 500,
                    opacity: 0.85,
                    marginTop: 6,
                  }}
                >
                  Crédito en movimiento
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: 36,
                  fontWeight: 700,
                  letterSpacing: -0.8,
                  lineHeight: 1.1,
                  marginTop: 8,
                }}
              >
                Microcréditos que impulsan tu negocio.
              </div>
            </div>
          </div>

          {/* COLUMNA DERECHA — Mockup iPhone */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 320,
            }}
          >
            <div
              style={{
                display: 'flex',
                width: 280,
                height: 560,
                background: '#0f0d24',
                borderRadius: 48,
                border: '4px solid #1a1735',
                padding: 8,
                boxShadow: '0 30px 60px rgba(0,0,0,.4)',
                transform: 'rotate(5deg)',
                position: 'relative',
              }}
            >
              {/* Notch */}
              <div
                style={{
                  position: 'absolute',
                  top: 14,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 90,
                  height: 20,
                  background: '#000',
                  borderRadius: 999,
                  display: 'flex',
                }}
              />
              {/* Screen */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  width: '100%',
                  height: '100%',
                  background: 'linear-gradient(165deg, #1a1738, #0f0d24)',
                  borderRadius: 40,
                  padding: '40px 18px 18px',
                  color: '#fff',
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', display: 'flex' }}>Hola,</div>
                    <div style={{ fontSize: 15, fontWeight: 700, display: 'flex' }}>Guadalupe</div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      fontSize: 36,
                      fontWeight: 900,
                      fontStyle: 'italic',
                      color: '#ec4899',
                      letterSpacing: -2,
                      transform: 'rotate(-5deg)',
                      lineHeight: 1,
                    }}
                  >
                    Mk
                  </div>
                </div>
                {/* Tabs */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
                  <div style={{ display: 'flex', fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 999, background: '#ec4899', color: '#fff' }}>
                    Mi crédito
                  </div>
                  <div style={{ display: 'flex', fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 999, background: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.6)' }}>
                    Pagos
                  </div>
                </div>
                {/* Credit card */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: 14,
                    borderRadius: 20,
                    backgroundImage: 'linear-gradient(135deg, #ec4899, #0ea5e9)',
                    marginBottom: 12,
                  }}
                >
                  <div style={{ display: 'flex', fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'rgba(255,255,255,.8)', textTransform: 'uppercase' }}>
                    Préstamo activo
                  </div>
                  <div style={{ display: 'flex', fontSize: 36, fontWeight: 800, lineHeight: 1, marginTop: 4 }}>
                    $8,750
                  </div>
                  <div style={{ display: 'flex', fontSize: 12, color: 'rgba(255,255,255,.8)', marginTop: 4 }}>
                    de $14,000 · semanal
                  </div>
                  {/* Progress bar */}
                  <div style={{ display: 'flex', width: '100%', height: 6, background: 'rgba(0,0,0,.25)', borderRadius: 999, marginTop: 14 }}>
                    <div style={{ display: 'flex', width: '62%', height: '100%', background: '#fff', borderRadius: 999 }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,.85)', marginTop: 4 }}>
                    <span>62% liquidado</span>
                    <span>14 / 22</span>
                  </div>
                </div>
                {/* Next payment */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: 12,
                    borderRadius: 14,
                    background: 'rgba(255,255,255,.06)',
                    border: '1px solid rgba(255,255,255,.1)',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', fontSize: 10, color: 'rgba(255,255,255,.6)' }}>Próximo pago</div>
                    <div style={{ display: 'flex', fontSize: 18, fontWeight: 800 }}>$750.00</div>
                    <div style={{ display: 'flex', fontSize: 10, color: 'rgba(255,255,255,.55)' }}>Jueves 23 oct</div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      fontSize: 12,
                      fontWeight: 700,
                      padding: '8px 14px',
                      borderRadius: 999,
                      background: '#ec4899',
                      color: '#fff',
                    }}
                  >
                    Pagar
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
