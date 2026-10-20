import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'MicroKapital — Microcréditos que impulsan tu negocio'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * Open Graph image del landing — luce idéntico al banner aprobado:
 * badge FINANCIERA, Mk gigante, wordmark MicroKapital + Crédito en
 * movimiento, headline con "impulsan" en gradient claro, footer con
 * microkapital.com, y mockup del iPhone de Guadalupe a la derecha.
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
          padding: '36px 56px 44px',
        }}
      >
        {/* COLUMNA IZQUIERDA — texto */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            marginRight: 40,
          }}
        >
          {/* Badge FINANCIERA */}
          <div
            style={{
              display: 'flex',
              fontSize: 15,
              letterSpacing: 6,
              textTransform: 'uppercase',
              fontWeight: 700,
              padding: '8px 22px',
              borderRadius: 999,
              border: '2px solid rgba(255,255,255,.6)',
              color: '#fff',
              alignSelf: 'flex-start',
            }}
          >
            Financiera
          </div>

          {/* Mk marker gigante */}
          <div
            style={{
              display: 'flex',
              fontSize: 210,
              lineHeight: 0.85,
              letterSpacing: -14,
              color: '#fff',
              fontWeight: 900,
              fontStyle: 'italic',
              transform: 'rotate(-6deg) translateX(-6px)',
              textShadow: '0 10px 30px rgba(0,0,0,.22)',
              marginTop: 14,
              marginBottom: 4,
            }}
          >
            Mk
          </div>

          {/* Wordmark */}
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 2 }}>
            <div style={{ display: 'flex', fontSize: 60, fontWeight: 800, letterSpacing: -2, lineHeight: 1 }}>
              MicroKapital
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: 17,
                letterSpacing: 9,
                textTransform: 'uppercase',
                fontWeight: 500,
                opacity: 0.85,
                marginTop: 6,
              }}
            >
              Crédito en movimiento
            </div>
          </div>

          {/* Headline con "impulsan" en gradient claro */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              fontSize: 38,
              fontWeight: 700,
              letterSpacing: -0.8,
              lineHeight: 1.1,
              marginTop: 20,
            }}
          >
            <span style={{ display: 'flex' }}>Microcréditos que&nbsp;</span>
            <span
              style={{
                display: 'flex',
                background: 'linear-gradient(90deg, #ffd6ea, #bae6fd)',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              impulsan
            </span>
            <span style={{ display: 'flex' }}>&nbsp;tu negocio.</span>
          </div>

          {/* Footer: solo dominio */}
          <div
            style={{
              display: 'flex',
              marginTop: 'auto',
              paddingTop: 24,
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: 1,
            }}
          >
            microkapital.com
          </div>
        </div>

        {/* COLUMNA DERECHA — Mockup iPhone */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 300,
          }}
        >
          <div
            style={{
              display: 'flex',
              width: 270,
              height: 540,
              background: '#0f0d24',
              borderRadius: 46,
              border: '4px solid #1a1735',
              padding: 8,
              boxShadow: '0 30px 60px rgba(0,0,0,.4)',
              transform: 'rotate(5deg)',
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 14,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 88,
                height: 20,
                background: '#000',
                borderRadius: 999,
                display: 'flex',
              }}
            />
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                height: '100%',
                background: 'linear-gradient(165deg, #1a1738, #0f0d24)',
                borderRadius: 38,
                padding: '40px 16px 16px',
                color: '#fff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', display: 'flex' }}>Hola,</div>
                  <div style={{ fontSize: 14, fontWeight: 700, display: 'flex' }}>Guadalupe</div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    fontSize: 32,
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
              <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                <div style={{ display: 'flex', fontSize: 10, fontWeight: 700, padding: '5px 10px', borderRadius: 999, background: '#ec4899', color: '#fff' }}>
                  Mi crédito
                </div>
                <div style={{ display: 'flex', fontSize: 10, fontWeight: 600, padding: '5px 10px', borderRadius: 999, background: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.6)' }}>
                  Pagos
                </div>
                <div style={{ display: 'flex', fontSize: 10, fontWeight: 600, padding: '5px 10px', borderRadius: 999, background: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.6)' }}>
                  Historial
                </div>
              </div>
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
                <div style={{ display: 'flex', fontSize: 9, fontWeight: 700, letterSpacing: 2, color: 'rgba(255,255,255,.8)', textTransform: 'uppercase' }}>
                  Préstamo activo
                </div>
                <div style={{ display: 'flex', fontSize: 34, fontWeight: 800, lineHeight: 1, marginTop: 4 }}>
                  $8,750
                </div>
                <div style={{ display: 'flex', fontSize: 11, color: 'rgba(255,255,255,.8)', marginTop: 4 }}>
                  de $14,000 · semanal
                </div>
                <div style={{ display: 'flex', width: '100%', height: 6, background: 'rgba(0,0,0,.25)', borderRadius: 999, marginTop: 14 }}>
                  <div style={{ display: 'flex', width: '62%', height: '100%', background: '#fff', borderRadius: 999 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(255,255,255,.85)', marginTop: 4 }}>
                  <span>62% liquidado</span>
                  <span>14 / 22</span>
                </div>
              </div>
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
                  <div style={{ display: 'flex', fontSize: 17, fontWeight: 800 }}>$750.00</div>
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
    ),
    { ...size },
  )
}
