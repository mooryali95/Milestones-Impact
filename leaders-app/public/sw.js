/* رحلة القادة: تثبيت على الجوال وفتح الواجهة دون اتصال */
// الواجهة وأصولها تُخزّن؛ طلبات الخادم (Supabase) لا تُخزّن أبدًا،
// فمحتوى الكتيب المحمي لا يبقى على الجهاز، وبيانات المشارك دائمًا حديثة.
const CACHE = 'mi-leaders-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/favicon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // التنقل: الشبكة أولًا، ثم آخر نسخة عند الانقطاع
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('/', copy)); return res; })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // الأصول ذات البصمة في /assets/ ثابتة: من المخزن أولًا
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    })),
  );
});
