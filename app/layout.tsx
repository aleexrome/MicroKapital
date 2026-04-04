import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'MicroKapital — Sistema de Gestión Financiera',
  description: 'Plataforma SaaS para microfinancieras',
  robots: 'noindex, nofollow',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
