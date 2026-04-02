const CACHE_NAME = 'rippet-v2'

// Arquivos essenciais para cache inicial
const PRECACHE = [
  '/dashboard',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/logo_rounded.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Network-first strategy: tenta rede, fallback para cache
self.addEventListener('fetch', (event) => {
  // Ignorar requests não-GET e requests para Supabase/API
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase')) return

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cachear respostas válidas
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() => caches.match(event.request))
  )
})

// ============================================
// Push Notifications
// ============================================
self.addEventListener('push', (event) => {
  if (!event.data) return

  const data = event.data.json()

  event.waitUntil(
    self.registration.showNotification(data.title || 'R.I.P. Pet', {
      body: data.body || '',
      icon: data.icon || '/icon-192x192.png',
      badge: data.badge || '/icon-96x96.png',
      data: { url: data.url || '/fichas' },
      vibrate: [200, 100, 200],
      tag: 'rippet-notification',
      renotify: true,
    })
  )
})

// Ao clicar na notificação, abre/foca a URL
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url = event.notification.data?.url || '/fichas'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Se já tem uma aba aberta, foca nela e navega
      for (const client of clients) {
        if (client.url.includes(self.location.origin)) {
          client.focus()
          client.navigate(url)
          return
        }
      }
      // Senão, abre uma nova
      return self.clients.openWindow(url)
    })
  )
})
