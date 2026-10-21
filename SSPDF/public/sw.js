/* SSPDF Service Worker — عمل كامل دون إنترنت بعد أول زيارة */
const CACHE = "sspdf-v2";
const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // طلبات قاعدة البيانات (Supabase): شبكة فقط — المزامنة تعالجها الواجهة
  if (url.hostname.endsWith(".supabase.co")) return;

  // التنقل بين الصفحات: الشبكة أولاً، ثم النسخة المخزنة عند انقطاع الاتصال
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  // الأصول الثابتة (JS/CSS/خطوط/صور + Tailwind CDN): التخزين أولاً ثم الشبكة
  if (e.request.method === "GET") {
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((res) => {
            if (res.ok && (url.origin === location.origin || url.hostname === "cdn.tailwindcss.com")) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(e.request, copy));
            }
            return res;
          })
      )
    );
  }
});
