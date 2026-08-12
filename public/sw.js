const VERSION = 'travel-web-v1'
const SHELL_CACHE = `${VERSION}-shell`
const RUNTIME_CACHE = `${VERSION}-runtime`

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll([
      new URL('./', self.registration.scope).href,
      new URL('./index.html', self.registration.scope).href,
      new URL('./manifest.webmanifest', self.registration.scope).href,
      new URL('./icon-192.svg', self.registration.scope).href,
      new URL('./icon-512.svg', self.registration.scope).href,
    ])),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
        .map((key) => caches.delete(key)),
    )),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const requestUrl = new URL(event.request.url)
  if (requestUrl.origin !== self.location.origin) return

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone()
          void caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, copy))
          return response
        })
        .catch(() => caches.match(new URL('./index.html', self.registration.scope).href)),
    )
    return
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached
      return fetch(event.request).then((response) => {
        if (!response.ok) return response
        const copy = response.clone()
        void caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, copy))
        return response
      })
    }),
  )
})
