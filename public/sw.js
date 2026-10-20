// Service worker mínimo — su única razón de existir es que Chrome
// requiere un SW con fetch handler para considerar el sitio "installable"
// y mostrar el prompt automático en móvil. No cacheamos nada: cada
// request pasa a la red tal cual (network-first sin storage).
//
// Si en el futuro queremos modo offline del portal del cliente,
// aquí se arma un cache de /mi-cuenta y assets estáticos.
self.addEventListener('install', (e) => {
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (e) => {
  // Passthrough — necesario para que el browser cuente al SW como "activo".
  e.respondWith(fetch(e.request).catch(() => new Response('', { status: 504 })))
})
