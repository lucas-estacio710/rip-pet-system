const CACHE_NAME = 'rippet-v1'

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
