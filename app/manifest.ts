import type { MetadataRoute } from 'next'

/**
 * PWA manifest — habilita la instalación del landing como app en el
 * celular. Chrome y Edge muestran el prompt "Instalar app" automático
 * cuando se cumple:
 *   - HTTPS (Vercel ya cumple)
 *   - manifest con name + icons + start_url + display: standalone
 *   - service worker con un fetch handler (ver public/sw.js)
 *
 * iOS Safari no muestra prompt — hay que mostrar instrucción manual
 * (lo hace InstallAppButton al detectar iOS).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MicroKapital Financiera',
    short_name: 'MicroKapital',
    description: 'Microcréditos que impulsan tu negocio',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0b0a1a',
    theme_color: '#ec4899',
    lang: 'es-MX',
    icons: [
      {
        src: '/pwa-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    categories: ['finance', 'business'],
  }
}
