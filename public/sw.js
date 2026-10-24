// Store Panel service worker
// - Uygulama dosyalarını önbelleğe alır (hızlı açılış)
// - Veri isteklerini (Supabase) asla önbelleğe almaz
// - Web push bildirimlerini gösterir

const CACHE = 'store-panel-v3'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return

  // Sayfa: önce ağ, çevrimdışıysa önbellek
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
          return res
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./'))),
    )
    return
  }

  // Diğer dosyalar (js, css, ikon): önce önbellek
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})

self.addEventListener('push', (event) => {
  let data = { title: 'Store Panel', body: 'Yeni bir uyarı var.', url: './#/uyarilar' }
  try {
    data = { ...data, ...event.data.json() }
  } catch (e) {
    /* düz metin gelmiş olabilir */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      data: { url: data.url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(self.clients.openWindow(event.notification.data.url || './'))
})
