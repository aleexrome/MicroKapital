import type { Metadata, Viewport } from 'next'
import { Permanent_Marker } from 'next/font/google'
import './globals.css'

// Fuente del logotipo "Mk" cursiva — usada en landing, favicon y sidebar.
const permanentMarker = Permanent_Marker({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-permanent-marker',
  display: 'swap',
})

// metadataBase se usa para resolver URLs relativas (opengraph-image,
// twitter-image, canonical). Sin esto, el crawler recibe URLs relativas
// y no puede descargar la imagen → WhatsApp muestra solo texto.
export const metadata: Metadata = {
  // IMPORTANTE: usar la MISMA forma del dominio que la gente comparte
  // (con www). Si metadataBase es non-www pero el crawler visita www,
  // el og:image resuelve a non-www y el crawler de WhatsApp no sigue
  // el redirect — resultado: no se descarga la imagen.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.microkapital.com',
  ),
  title: 'MicroKapital — Cuando nadie apuesta por ti, nosotros sí',
  description:
    'Préstamos grupales e individuales desde $4,000. Aprobación ágil con acompañamiento real en cada etapa.',
  // Panel interno sigue sin indexar; solo /mantenimiento y el landing son
  // públicos. Como /dashboard, /admin, etc. están detrás de login, no hay
  // riesgo de que Google indexe datos privados. Permitimos indexar el
  // landing para que Facebook/WhatsApp lean el OG correctamente.
  robots: 'index, follow',
  openGraph: {
    title: 'MicroKapital Financiera',
    description: 'Cuando nadie apuesta por ti, nosotros sí.',
    url: '/',
    siteName: 'MicroKapital',
    locale: 'es_MX',
    type: 'website',
    // Imagen explícita (además de la que Next inyecta de
    // app/opengraph-image.tsx). WhatsApp a veces no sigue la convención
    // de Next; con esto nos aseguramos que siempre haya un og:image.
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'MicroKapital — Cuando nadie apuesta por ti, nosotros sí',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MicroKapital Financiera',
    description: 'Cuando nadie apuesta por ti, nosotros sí.',
    images: ['/opengraph-image'],
  },
}

// Status bar + safe-area del browser/PWA en negro para que no se vea
// una franja rosa arriba (antes el theme-color era #ec4899).
export const viewport: Viewport = {
  themeColor: '#0b0a1a',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning className={permanentMarker.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
