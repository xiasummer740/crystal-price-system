const CACHE = 'crystal-v3'
const URLS = ['/', '/#/mobile', '/#/', '/#/add']

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => Promise.allSettled(URLS.map(u => c.add(u).catch(() => {}))))
  )
})

self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/')) {
    // API 请求：网络优先，保证数据实时性
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    )
    return
  }
  // 静态资源：缓存优先
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      if (res.ok && e.request.url.includes('/assets/')) {
        const clone = res.clone()
        caches.open(CACHE).then(c => c.put(e.request, clone))
      }
      return res
    }))
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))))
})
