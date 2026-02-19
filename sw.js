const CACHE_NAME = 'gestor-sp-v2.2.12'
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/main.js',
  './js/store.js',
  './js/auth-service.js',
  './js/firebase-config.js',
  './js/core/calculator.js',
  './js/ui/render.js',
  './js/ui/chart.js',
  './js/utils/formatter.js',
  './js/ai-service.js',
  './js/utils/exporter.js'
]

self.addEventListener('install', event => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Abrindo cache v2.2.12')
      return cache.addAll(ASSETS_TO_CACHE)
    })
  )
})

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      // Cache hit - retorna a resposta do cache
      if (response) {
        return response
      }
      return fetch(event.request)
    })
  )
})

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME]
  event.waitUntil(
    caches
      .keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheWhitelist.indexOf(cacheName) === -1) {
              return caches.delete(cacheName)
            }
          })
        )
      })
      .then(() => self.clients.claim())
  )
})

// --- Push Notification Listeners ---

self.addEventListener('push', event => {
  let data = {
    title: 'Gestor SP',
    body: 'Nova atualização disponível!',
    icon: 'assets/icons/icon-192x192.png'
  }

  if (event.data) {
    try {
      const pushData = event.data.json()
      data = { ...data, ...pushData }
    } catch (e) {
      data.body = event.data.text()
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || 'assets/icons/icon-192x192.png',
    badge: 'assets/icons/icon-192x192.png', // Or a smaller badge icon if available
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '1'
    }
  }

  event.waitUntil(self.registration.showNotification(data.title, options))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        if (clientList.length > 0) {
          let client = clientList[0]
          for (let i = 0; i < clientList.length; i++) {
            if (clientList[i].focused) {
              client = clientList[i]
            }
          }
          return client.focus()
        }
        return clients.openWindow('./')
      })
  )
})
