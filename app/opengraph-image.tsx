import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'MicroKapital — Cuando nadie apuesta por ti, nosotros sí'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * Open Graph image del landing — luce idéntico al banner aprobado:
 * badge FINANCIERA, Mk gigante en Permanent Marker (fuente real
 * del logo), wordmark MicroKapital + Crédito en movimiento, slogan
 * oficial, footer microkapital.com, iPhone a la derecha.
 *
 * La fuente Permanent Marker se descarga directo de fonts.gstatic.com
 * (Google Fonts static). Si el fetch falla por lo que sea, cae a
 * italic bold (fallback que no rompe la ruta).
 */
export default async function Image() {
  // Cargamos AMBAS fuentes: Permanent Marker para el "Mk", Inter 700
  // para el resto. Si solo registramos Permanent Marker, next/og la
  // usa para TODO el texto (ignora fontFamily: 'Inter' porque Inter no
  // está disponible). Registrar las dos resuelve el bug.
  const [permanentMarker, inter] = await Promise.all([
    fetch('https://fonts.gstatic.com/s/permanentmarker/v16/Fh4uPib9Iyv2ucM6pGQMWimMp004Hao.ttf')
      .then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null),
    fetch('https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf')
      .then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null),
  ])

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          color: '#fff',
          // next/og usa 'Inter' como fuente built-in. 'Inter' no
          // mapea y cae a la única fuente registrada (PermanentMarker)
          // haciendo que TODO el texto saliera en marker.
          fontFamily: 'Inter',
          backgroundImage: `
            radial-gradient(130% 170% at 8% 8%, #ff6ab0 0%, transparent 55%),
            radial-gradient(110% 170% at 95% 95%, #38bdf8 0%, transparent 55%),
            linear-gradient(120deg, #ec4899 0%, #d946ef 35%, #6366f1 65%, #0ea5e9 100%)
          `,
          padding: '36px 56px 44px',
          overflow: 'hidden',
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

          {/* Mk marker — proporción como en el artifact */}
          <div
            style={{
              display: 'flex',
              fontFamily: permanentMarker ? 'PermanentMarker' : 'Inter',
              fontSize: permanentMarker ? 140 : 130,
              lineHeight: 0.85,
              letterSpacing: permanentMarker ? -2 : -10,
              color: '#fff',
              fontWeight: permanentMarker ? 400 : 900,
              fontStyle: permanentMarker ? 'normal' : 'italic',
              textShadow: '0 8px 20px rgba(0,0,0,.22)',
              marginTop: 12,
              marginBottom: 20,
            }}
          >
            Mk
          </div>

          {/* Wordmark */}
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 0 }}>
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

          {/* Slogan oficial — grande para llenar el espacio vertical */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              fontSize: 46,
              fontWeight: 700,
              letterSpacing: -1,
              lineHeight: 1.15,
              marginTop: 32,
            }}
          >
            <span style={{ display: 'flex' }}>Cuando nadie apuesta por ti,&nbsp;</span>
            <span
              style={{
                display: 'flex',
                background: 'linear-gradient(90deg, #ffd6ea, #bae6fd)',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              nosotros sí
            </span>
            <span style={{ display: 'flex' }}>.</span>
          </div>

          {/* Footer: solo dominio */}
          <div
            style={{
              display: 'flex',
              marginTop: 'auto',
              paddingTop: 28,
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: 1,
            }}
          >
            microkapital.com
          </div>
        </div>

        {/* COLUMNA DERECHA — Mockup iPhone (sale por el borde inferior) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            width: 400,
            marginBottom: -260,  // empuja el iPhone fuera del banner por abajo
          }}
        >
          <div
            style={{
              display: 'flex',
              width: 380,
              height: 900,
              background: '#0f0d24',
              borderRadius: 60,
              border: '6px solid #1a1735',
              padding: 12,
              boxShadow: '0 30px 60px rgba(0,0,0,.4)',
              transform: 'rotate(4deg)',
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 18,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 110,
                height: 25,
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
                borderRadius: 48,
                padding: '46px 18px 10px',
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
                    fontFamily: permanentMarker ? 'PermanentMarker' : 'Inter',
                    fontSize: permanentMarker ? 36 : 32,
                    fontWeight: permanentMarker ? 400 : 900,
                    fontStyle: permanentMarker ? 'normal' : 'italic',
                    color: '#ec4899',
                    letterSpacing: -1,
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

              {/* Tab bar inferior — igual al artifact */}
              <div
                style={{
                  display: 'flex',
                  marginTop: 'auto',
                  paddingTop: 10,
                  borderTop: '1px solid rgba(255,255,255,.06)',
                  gap: 4,
                }}
              >
                {[
                  { label: 'Inicio', active: true },
                  { label: 'Pagos', active: false },
                  { label: 'Tickets', active: false },
                  { label: 'Perfil', active: false },
                ].map((t) => (
                  <div
                    key={t.label}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      flex: 1,
                      fontSize: 8,
                      color: t.active ? '#ec4899' : 'rgba(255,255,255,.4)',
                      gap: 2,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        width: 12,
                        height: 12,
                        borderRadius: 3,
                        background: 'currentColor',
                        opacity: 0.9,
                      }}
                    />
                    {t.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        ...(inter ? [{ name: 'Inter' as const, data: inter, style: 'normal' as const, weight: 700 as const }] : []),
        ...(permanentMarker ? [{ name: 'PermanentMarker' as const, data: permanentMarker, style: 'normal' as const, weight: 400 as const }] : []),
      ],
    },
  )
}
