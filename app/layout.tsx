import type { Metadata } from 'next'
import { Permanent_Marker } from 'next/font/google'
import './globals.css'

// Fuente del logotipo "Mk" cursiva — usada en landing, favicon y sidebar.
const permanentMarker = Permanent_Marker({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-permanent-marker',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'MicroKapital — Microcréditos que impulsan tu negocio',
  description:
    'Préstamos grupales e individuales desde $4,000. Aprobación en 48 horas, sin aval, con acompañamiento real en cada etapa.',
  // Panel interno sigue sin indexar; solo /mantenimiento y el landing son
  // públicos. Como /dashboard, /admin, etc. están detrás de login, no hay
  // riesgo de que Google indexe datos privados. Permitimos indexar el
  // landing para que Facebook/WhatsApp lean el OG correctamente.
  robots: 'index, follow',
  openGraph: {
    title: 'MicroKapital Financiera',
    description: 'Microcréditos que impulsan tu negocio.',
    locale: 'es_MX',
    type: 'website',
  },
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
